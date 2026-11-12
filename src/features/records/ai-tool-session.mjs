// 受控聊天／评测的一次用户请求。此模块只管理定义与待审请求，不授予权限、不调用保存。
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
const payloadKey = (name, args) => { const copy = { ...args }; delete copy.operationId; return name + ':' + canonical(copy); };
export function createAiToolSession(contract) {
  const enabled = new Set(), receipts = new Map(); let pendingRecord = null;
  const byName = new Map(contract.tools.map(tool => [tool.name, tool]));
  const loadTool = { type: 'function', function: { name: 'load_tools', description: '申请启用目录中的业务工具。只加载定义，不查询数据、不提交记录。下一轮才能使用新启用的工具。可一次申请多项，按当前任务需要选择。', parameters: { type: 'object', additionalProperties: false, required: ['names'], properties: { names: { type: 'array', minItems: 1, maxItems: contract.tools.length, uniqueItems: true, items: { type: 'string', enum: [...byName.keys()] } } } } } };
  const load = args => {
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).some(key => key !== 'names') || !Array.isArray(args.names) || !args.names.length || args.names.length > byName.size || new Set(args.names).size !== args.names.length || args.names.some(name => !byName.has(name))) return { error: 'invalid_tool_selection', message: 'names须为目录中不重复的正式工具名数组；没有加载。' };
    const added = args.names.filter(name => !enabled.has(name)); args.names.forEach(name => enabled.add(name));
    return { loaded: added, alreadyLoaded: args.names.filter(name => !added.includes(name)), available: [...enabled], message: '完整定义加入下一轮tools。请按其字段名和类型重新生成参数；本轮未查询或保存业务数据。' };
  };
  return {
    names: () => [...enabled], load,
    tools: () => [loadTool, ...contract.tools.filter(tool => enabled.has(tool.name)).map(tool => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } }))],
    missing(name) {
      if (!byName.has(name)) return { error: 'unknown_tool', message: '工具名不在目录中，请从目录选择正式名称。', executed: false };
      load({ names: [name] });
      return { error: 'tool_not_loaded', tool: name, executed: false, loadedForNextRound: [name], nextAction: 'regenerate_arguments_using_next_round_definition', message: '本次未执行。已为下一轮加入此工具完整定义；请先读字段要求，再重新调用，不能原样沿用另一工具的参数。' };
    },
    prepare(name, args) {
      const cached = receipts.get(payloadKey(name, args));
      if (cached) return { result: { ...cached, repeated: true }, coordination: '相同请求复用本题已有回执，未再次创建预览' };
      if (name === 'submit_record_operation' && pendingRecord && !args.previewId) {
        const order = rows => [...rows].sort(([a], [b]) => a.localeCompare(b));
        const prior = order(pendingRecord.keys), next = Array.isArray(args.items) ? order(args.items.map(item => [item.key, item.kind])) : [];
        if (canonical(prior) !== canonical(next)) return { result: { error: 'existing_draft_requires_explicit_correction', previewId: pendingRecord.id, revision: pendingRecord.revision, message: '本次用户请求已有统一草稿。先读取原草稿并修正原key，不另建第二份；新增独立任务应开始新一次用户请求。' } };
        return { args: { ...args, operationId: crypto.randomUUID(), previewId: pendingRecord.id, revision: pendingRecord.revision }, coordination: '将本题同批修正送回原待审草稿；服务器仍校验原授权、版本和有效期' };
      }
      return { args };
    },
    remember(name, args, result) {
      if (result?.error || result?.status !== 'pending' || typeof result.id !== 'string') return;
      // 一个草稿修正后，旧请求回执也必须指向当前版本，避免再次展示已失效内容。
      for (const [key, receipt] of receipts) if (receipt.id === result.id) receipts.set(key, result);
      if (['preview_meal', 'preview_energy', 'submit_record_operation', 'submit_meal_operation'].includes(name)) receipts.set(payloadKey(name, args), result);
      if (name === 'submit_record_operation') pendingRecord = { id: result.id, revision: result.revision, keys: args.items.map(item => [item.key, item.kind]) };
      else if (pendingRecord?.id === result.id) pendingRecord.revision = result.revision;
    },
  };
}
