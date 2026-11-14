// 受控聊天／评测的一次用户请求。此模块只管理定义与待审请求，不授予权限、不调用保存。
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const payloadKey = (name, args) => { const copy = { ...args }; delete copy.operationId; return name + ':' + canonical(copy); };
const previewCreators = new Set(['preview_measurements','preview_meals','preview_foods','preview_training','preview_energy','preview_meal_changes','preview_record_bundle']);
function normalizeUnknownAmounts(name, args) {
  let changed = false;
  const clean = food => {
    if (!food || typeof food !== 'object' || food.amountDecision !== 'unknown_accepted' || food.foodId || food.foodRef || food.foodDraft) return food;
    const copy = { ...food };
    if (copy.quantity === null || copy.quantity === '') { delete copy.quantity; changed = true; }
    if (copy.quantity === undefined && (copy.unit === null || copy.unit === '')) { delete copy.unit; changed = true; }
    return copy;
  };
  const next = { ...args };
  if (name === 'preview_meal' && Array.isArray(args.foods)) next.foods = args.foods.map(clean);
  if (name === 'preview_meals' && Array.isArray(args.meals)) next.meals = args.meals.map(meal => ({...meal,foods:Array.isArray(meal.foods)?meal.foods.map(clean):meal.foods}));
  if (name === 'preview_meal_changes' && Array.isArray(args.addFoods)) next.addFoods = args.addFoods.map(clean);
  if (['submit_record_operation','submit_meal_operation','preview_record_bundle'].includes(name)) for (const key of ['items','actions']) {
    if (Array.isArray(args[key])) next[key] = args[key].map(item => item?.kind === 'save_meal' && Array.isArray(item.items) ? { ...item, items: item.items.map(clean) } : item);
  }
  return { args: changed ? next : args, changed };
}
function existingMealIds(name,args) {
  if (name === 'preview_meal_changes' && typeof args.mealId === 'string') return [args.mealId];
  const actions = args.actions ?? args.items;
  return ['submit_meal_operation','submit_record_operation'].includes(name) && Array.isArray(actions)
    ? actions.filter(item => item?.kind === 'save_meal' && typeof item.id === 'string').map(item => item.id) : [];
}
/** @param {{tools: Array<{name:string,description:string,inputSchema:{properties?:Record<string,unknown>,required?:string[],[key:string]:unknown}}>}} contract @param {{managedOperationIds?: boolean, normalizeUnknownAmounts?: boolean, operationIdFor?: (name:string,args:Record<string,unknown>)=>string}} options */
export function createAiToolSession(contract, options = {}) {
  const enabled = new Set(), receipts = new Map(), pendingMeals = [], pendingMealEdits = new Map(); let pendingRecord = null;
  const operationIds = new Map(), requestAliases = new Map();
  let pendingPreview = null;
  const managedArgs = (name, args) => {
    const key = previewCreators.has(name) ? 'v2-task-creation' : payloadKey(name, args), content = { ...args }; delete content.operationId;
    if (!operationIds.has(key)) operationIds.set(key, options.operationIdFor?.(name,content) ?? crypto.randomUUID());
    return { ...content, operationId: operationIds.get(key) };
  };
  const byName = new Map(contract.tools.map(tool => [tool.name, tool]));
  const loadTool = { type: 'function', function: { name: 'load_tools', description: '申请启用目录中的业务工具。只加载定义，不查询数据、不提交记录。下一轮才能使用新启用的工具。可一次申请多项，按当前任务需要选择。', parameters: { type: 'object', additionalProperties: false, required: ['names'], properties: { names: { type: 'array', minItems: 1, maxItems: contract.tools.length, uniqueItems: true, items: { type: 'string', enum: [...byName.keys()] } } } } } };
  const load = args => {
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'names') || !Array.isArray(args.names) || !args.names.length || args.names.length > byName.size || new Set(args.names).size !== args.names.length || args.names.some(name => !byName.has(name))) return { error: 'invalid_tool_selection', message: 'names须为目录中不重复的正式工具名数组；没有加载。' };
    const added = args.names.filter(name => !enabled.has(name)); args.names.forEach(name => enabled.add(name));
    return { loaded: added, alreadyLoaded: args.names.filter(name => !added.includes(name)), available: [...enabled], message: '完整定义加入下一轮tools。请按其字段名和类型重新生成参数；本轮未查询或保存业务数据。' };
  };
  return {
    names: () => [...enabled], load,
    tools: () => [loadTool, ...contract.tools.filter(tool => enabled.has(tool.name)).map(tool => {
      const parameters = structuredClone(tool.inputSchema);
      if (options.managedOperationIds && parameters.properties?.operationId) {
        delete parameters.properties.operationId;
        parameters.required = parameters.required?.filter(key => key !== 'operationId');
      }
      const description = tool.description + (options.managedOperationIds && tool.inputSchema.properties?.operationId ? '\n当前站内会话的请求编号由服务器管理，无需填写operationId。' : '');
      return { type: 'function', function: { name: tool.name, description, parameters } };
    })],
    missing(name) {
      if (!byName.has(name)) return { error: 'unknown_tool', message: '工具名不在目录中，请从目录选择正式名称。', executed: false };
      load({ names: [name] });
      return { error: 'tool_not_loaded', tool: name, executed: false, loadedForNextRound: [name], nextAction: 'regenerate_arguments_using_next_round_definition', message: '本次未执行。已为下一轮加入此工具完整定义；请先读字段要求，再重新调用，不能原样沿用另一工具的参数。' };
    },
    /** @returns {{args?: Record<string,unknown>,result?: Record<string,unknown>,coordination?: string}} */
    prepare(name, args) {
      const normalized = options.normalizeUnknownAmounts ? normalizeUnknownAmounts(name,args) : {args,changed:false}; args = normalized.args;
      const normalizationNote = normalized.changed ? '；已将标为unknown_accepted的新自由餐项空食量转为省略字段，没有决定数量' : '';
      const cached = receipts.get(payloadKey(name, args));
      if (cached) return { result: { ...cached, repeated: true }, coordination: '相同请求复用本题已有回执，未再次创建预览' };
      if (previewCreators.has(name) && pendingPreview && contract.tools.some(tool=>tool.name==='update_preview')) {
        const wanted=['get_preview','update_preview'].filter(tool=>byName.has(tool)); if(wanted.length) load({names:wanted});
        return {result:{error:'existing_preview_requires_update',id:pendingPreview.id,previewId:pendingPreview.id,revision:pendingPreview.revision,confirmationUrl:pendingPreview.confirmationUrl,executed:false,loadedForNextRound:wanted,nextAction:'read_then_update_original_preview',message:'本任务已有预览。内容正确就沿用原链接；需要修改或确实漏项，用update_preview对原id/revision局部修改或appendItems，不改用其他创建入口另建批次。'},coordination:'已有任务草稿，原创建请求未再次执行'};
      }
      const priorEdit = existingMealIds(name,args).map(id => pendingMealEdits.get(id)).find(edit => edit && edit.id !== args.previewId);
      if (priorEdit) {
        const wanted = [priorEdit.operationType === 'record' ? 'get_record_operation' : 'get_meal_operation','preview_meal_changes'].filter(tool => byName.has(tool));
        if (wanted.length) load({names:wanted});
        return { result: {error:'existing_meal_edit_preview_requires_correction',previewId:priorEdit.id,revision:priorEdit.revision,confirmationUrl:priorEdit.confirmationUrl,executed:false,loadedForNextRound:wanted,nextAction:'reuse_or_correct_original_meal_preview',message:'本次未执行。这个历史餐次在当前任务已有待审预览；内容已正确时直接展示原确认链接。需要继续改动时读取最新预览，再用preview_meal_changes携带previewId/revision，只改指定字段；不要改用全量save_meal另建同一餐的预览。'} };
      }
      if (name === 'preview_meal') {
        const existing = pendingMeals.find(meal => meal.mealType === args.mealType && [meal.date, meal.inputDate].includes(args.date));
        if (existing) {
          load({ names: ['preview_meal_changes'] });
          return { result: { error: 'existing_meal_preview_requires_correction', previewId: existing.id, revision: existing.revision, executed: false, loadedForNextRound: ['preview_meal_changes'], nextAction: 'correct_original_meal_preview', message: '本次请求的这顿餐已有待审草稿。补营养、改数量或备注请用preview_meal_changes携带previewId/revision，updateFoods按index只改对应字段；不要另建一份。若确实是独立的另一餐，先向用户澄清，不自动合并。' } };
        }
      }
      if (name === 'preview_energy' && pendingRecord) {
        load({ names: ['get_record_operation', 'submit_record_operation'] });
        return { result: { error: 'existing_record_preview_requires_correction', previewId: pendingRecord.id, revision: pendingRecord.revision, executed: false, loadedForNextRound: ['get_record_operation', 'submit_record_operation'], nextAction: 'read_and_correct_original_record_preview', message: '本次请求已有统一待审草稿。请读取原批次的项目key，使用submit_record_operation的previewId/revision修正，不再创建另一份消耗预览。真正独立的另一项任务需先澄清。' } };
      }
      if (name === 'submit_record_operation' && pendingRecord && !args.previewId) {
        const order = rows => [...rows].sort(([a], [b]) => a.localeCompare(b));
        const prior = order(pendingRecord.keys), next = Array.isArray(args.items) ? order(args.items.map(item => [item.key, item.kind])) : [];
        if (canonical(prior) !== canonical(next)) return { result: { error: 'existing_draft_requires_explicit_correction', previewId: pendingRecord.id, revision: pendingRecord.revision, message: '本次用户请求已有统一草稿。先读取原草稿并修正原key，不另建第二份；新增独立任务应开始新一次用户请求。' } };
        const correction = { ...args, previewId: pendingRecord.id, revision: pendingRecord.revision };
        const corrected = options.managedOperationIds ? managedArgs(name,correction) : { ...correction, operationId: crypto.randomUUID() };
        requestAliases.set(payloadKey(name,corrected),payloadKey(name,args));
        return { args: corrected, coordination: '将本题同批修正送回原待审草稿；服务器仍校验原授权、版本和有效期' };
      }
      if (options.managedOperationIds && byName.get(name)?.inputSchema.properties?.operationId) {
        return { args: managedArgs(name,args), coordination: '请求编号由当前会话生成；同内容重试复用，业务参数仍按正式接口校验'+normalizationNote };
      }
      return { args, ...(normalizationNote ? {coordination:normalizationNote.slice(1)} : {}) };
    },
    remember(name, args, result) {
      if (result && !result.error && typeof result.id==='string') {
        for(const [key,receipt] of receipts) if(receipt.id===result.id) receipts.set(key,result);
        if (previewCreators.has(name) || name==='update_preview') {
          if(result.status==='pending') { pendingPreview=result;receipts.set(payloadKey(name,args),result); }
          else if(pendingPreview?.id===result.id) pendingPreview=null;
        }
        if(name==='get_preview' && pendingPreview?.id===result.id) pendingPreview=result.status==='pending'?result:null;
      }
      if (result?.error || result?.status !== 'pending' || typeof result.id !== 'string') return;
      // 一个草稿修正后，旧请求回执也必须指向当前版本，避免再次展示已失效内容。
      for (const [key, receipt] of receipts) if (receipt.id === result.id) receipts.set(key, result);
      if (['preview_meal', 'preview_meal_changes', 'preview_energy', 'submit_record_operation', 'submit_meal_operation'].includes(name)) receipts.set(payloadKey(name, args), result);
      const alias = requestAliases.get(payloadKey(name,args));
      if (alias) receipts.set(alias,result);
      for (const edit of pendingMealEdits.values()) if ([result.id,args.previewId].includes(edit.id)) {
        for (const [key,receipt] of receipts) if (receipt.id === edit.id) receipts.set(key,result);
        Object.assign(edit,{id:result.id,revision:result.revision,operationType:result.operationType??edit.operationType,confirmationUrl:result.confirmationUrl});
      }
      for (const id of existingMealIds(name,args)) pendingMealEdits.set(id,{id:result.id,revision:result.revision,operationType:result.operationType??(name==='submit_record_operation'?'record':'meal'),confirmationUrl:result.confirmationUrl});
      if (name === 'preview_meal') {
        const meal = result.rows?.find(row => row.meal)?.meal;
        pendingMeals.push({ id: result.id, revision: result.revision, date: meal?.date ?? args.date, inputDate: args.date, mealType: args.mealType });
      } else for (const meal of pendingMeals) {
        if (name === 'preview_meal_changes' && meal.id === args.previewId) {
          for (const [key,receipt] of receipts) if (receipt.id === meal.id) receipts.set(key,result);
          meal.id = result.id; meal.revision = result.revision;
        } else if (meal.id === result.id) meal.revision = result.revision;
      }
      if (name === 'submit_record_operation' || name === 'preview_energy' && result.operationType === 'record') pendingRecord = { id: result.id, revision: result.revision, keys: name === 'submit_record_operation' ? args.items.map(item => [item.key, item.kind]) : (result.rows ?? []).map(row => [row.key, row.kind ?? row.action?.kind]) };
      else if (pendingRecord?.id === result.id) pendingRecord.revision = result.revision;
    },
  };
}
