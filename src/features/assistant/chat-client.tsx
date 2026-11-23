"use client";
import {choosePhotoRoute,type PhotoRegion,type PhotoRoute} from "../meals/photo-route";
import { resolveSupplement,type FollowupSubmission } from "./followup";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AccountEntitlements } from "../auth/entitlements";
import { CHAT_PHOTO_LIMIT, type ChatControlAction, type ChatEvent, type ChatMessage, type ChatProvider, type ChatSnapshot } from "./chat-model";
import {uploadPrivateMealPhoto,stagePrivateMealPhoto,PhotoTransferError,type PhotoUploadPhase} from "../meals/photo-upload";
import { confirmAction } from "../../components/confirmation-state";
export type DraftPhoto={key:string;id?:string;name:string;file:File;preview?:string;phase:PhotoUploadPhase|"queued"|"error";percent:number;label:string;error?:string;canRelay?:boolean;region?:PhotoRegion;route?:Promise<PhotoRoute>};
export type ArrivalViewport = {height:number; offsetTop:number};
type SendBody = {
  action:"send"|"retry"|"continue"; requestId:string; conversationId:string; provider:ChatProvider;
  timezone:string; text?:string; replyToId?:string; messageId?:string; imageIds?:string[]; imageSubset?:string[]; followup?:FollowupSubmission;
};
export type OutgoingMessage = {
  message:ChatMessage; body:SendBody; photos:DraftPhoto[]; quote:ChatMessage|null; viewport?:ArrivalViewport;
  phase:"sending"|"accepted"|"error"; error?:string;
};
const chatEndpoint = "/api/assistant-chat";
const streamHeaders = {"Formward-Chat-Stream": "delta-1"};

type Delivery = {
  controller: AbortController;
  conversationId: string;
  requestId: string;
  runId?: string;
  terminal?: boolean;
  stopQueued?: boolean;
  flushStop: () => void;
};

function deliveredReply(snapshot: ChatSnapshot | null, delivery: Delivery) {
  if (snapshot?.conversationId !== delivery.conversationId) return;
  return [...snapshot.messages, ...(snapshot.photoUpdates ?? [])]
    .find(row => row.role === "assistant" && row.requestId === delivery.requestId);
}

function activeConversationRun(snapshot: ChatSnapshot | null) {
  const timing = snapshot?.runTiming;
  return timing && timing.runId === snapshot.activeRunId ? timing.runId : undefined;
}

async function consumeChatEvents(response:Response, handle:(event:ChatEvent)=>boolean) {
  if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) return false;
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const part = await reader.read();
      buffer += part.done ? decoder.decode() : decoder.decode(part.value,{stream:true});
      let index: number;
      while ((index = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0,index);
        buffer = buffer.slice(index+2);
        const line = block.split("\n").find(value => value.startsWith("data: "));
        if (!line) continue;
        const event = JSON.parse(line.slice(6)) as ChatEvent;
        if (!handle(event)) return false;
        if (event.type === "done") return true;
      }
      if (part.done) return false;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
type ChatClient = {
  accountId: string;
  scrollState: () => { top: number; stick: boolean }; recordScroll: (top: number, stick: boolean) => void;
  enabled: boolean; entitlement?: AccountEntitlements; data: ChatSnapshot | null; messages: ChatMessage[]; newRequests:ReadonlySet<string>; claimArrival:(key:string)=>boolean; draft: string; setDraft: (value: string) => void;
  quote: ChatMessage | null; setQuote: (value: ChatMessage | null) => void; photos: DraftPhoto[]; removePhoto: (key: string) => void; retryPhoto:(key:string,transport?:"direct"|"relay",region?:PhotoRegion)=>Promise<void>;
  error: string; loading: boolean; delayed: boolean; busy: boolean; managing: boolean; uploading: string;
  refreshing: boolean; refresh: () => Promise<void>; more: () => Promise<void>;
  canStop: boolean; stopping: boolean; stop: () => void;
  send: (action?: "send" | "retry" | "continue", messageId?: string,followup?:FollowupSubmission,
    options?:{imageSubset?:string[];viewport?:ArrivalViewport}) => Promise<boolean>;
  outgoing: ReadonlyMap<string,OutgoingMessage>;
  retryOutgoing: (id:string) => Promise<boolean>;
  restoreOutgoing: (id:string) => Promise<void>;
  releaseSentPreview: (id:string,imageId:string) => void;
  control: (action: Exclude<ChatControlAction, "stop"> | "remove_conversation", provider?: ChatProvider, conversationId?: string, sourceMessageId?: string) => Promise<boolean>;
  addPhotos: (files: File[]) => Promise<void>;
};
const Context = createContext<ChatClient | null>(null);
export function useOptionalAssistantChat(){return useContext(Context);}
export function useAssistantChat() { const value = useContext(Context); if (!value) throw Error("ChatProvider missing"); return value; }
export function AssistantChatProvider({ enabled, initialEntitlement, open, accountId, children }: { enabled: boolean; initialEntitlement?:AccountEntitlements; open: boolean; accountId: string; children: ReactNode }) {
  const [access,setAccess]=useState(initialEntitlement);
  // 同账号的迟到读取不能把已观察到的新档位覆盖回旧版本。
  const accessRef=useRef(initialEntitlement);
  const updateAccess=useCallback((next:AccountEntitlements)=>{if(accessRef.current&&accessRef.current.version>next.version)return false;accessRef.current=next;setAccess(next);return true;},[]);
  const canChat=access?.chat??enabled;
  const [data, setData] = useState<ChatSnapshot | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]), [draft, setDraft] = useState(""), [quote, setQuote] = useState<ChatMessage | null>(null), [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [delayed, setDelayed] = useState(false), [running, setRunning] = useState(false), [managing, setManaging] = useState(false);
  const [submitting, setSubmitting] = useState(false), [stopping, setStopping] = useState(false), [refreshing, setRefreshing] = useState(false);
  const deferredRead = useRef(false);
  const request = useRef<Delivery | null>(null), current = useRef<ChatSnapshot | null>(null), generation = useRef(0), alive = useRef(true);
  const reading = useRef<{ controller: AbortController; manual: boolean } | null>(null);
  const snapshots = useRef(0);
  const scroll = useRef({ top: 0, stick: true });
  const savedDrafts=useRef(new Map<string,{draft:string;quote:ChatMessage|null;photos:DraftPhoto[];scroll:{top:number;stick:boolean}; older:ChatMessage[]}>());
  const pendingResumeSource = useRef<string | null>(null);
  const pendingRequest = useRef<{signature:string;id:string}|null>(null);
  const cursors = useRef(new Map<string,{runId:string|undefined;length:number}>());
  const [outgoing,setOutgoing] = useState<ReadonlyMap<string,OutgoingMessage>>(() => new Map());
  const outbox = useRef(outgoing);
  const updateOutgoing = useCallback((id:string,update:(value:OutgoingMessage|undefined)=>OutgoingMessage|undefined) => {
    const value = update(outbox.current.get(id));
    if (value === outbox.current.get(id)) return;
    const next = new Map(outbox.current);
    if (value) next.set(id,value); else next.delete(id);
    outbox.current = next;
    setOutgoing(next);
  },[]);
  const [newRequests,setNewRequests]=useState<ReadonlySet<string>>(new Set());
  const arrivals=useRef(new Set<string>());
  const claimArrival=useCallback((key:string)=>{if(arrivals.current.has(key))return false;arrivals.current.add(key);if(arrivals.current.size>120)arrivals.current.delete(arrivals.current.values().next().value!);return true;},[]);
  const mutating = useRef(false);
  const photoState=useRef<DraftPhoto[]>([]),photoRequests=useRef(new Map<string,AbortController>()),photoQueue=useRef<{key:string;transport:"direct"|"relay";region?:PhotoRegion}[]>([]),photoWorking=useRef(false),photoEpoch=useRef(0);
  const uploading=photos.find(photo=>!["ready","error"].includes(photo.phase))?.label??"";
  function updatePhotos(update:(current:DraftPhoto[])=>DraftPhoto[]){const next=update(photoState.current);photoState.current=next;setPhotos(next);}
  function removePhoto(key:string){photoRequests.current.get(key)?.abort();const photo=photoState.current.find(item=>item.key===key);if(photo?.preview)URL.revokeObjectURL(photo.preview);updatePhotos(current=>current.filter(item=>item.key!==key));}

  async function processPhotos(jobs:{key:string;transport:"direct"|"relay";region?:PhotoRegion}[]){
    photoQueue.current.push(...jobs);if(photoWorking.current)return;photoWorking.current=true;
    const epoch=photoEpoch.current;
    try{for(;;){const job=photoQueue.current.shift();if(!job||epoch!==photoEpoch.current)break;const photo=photoState.current.find(item=>item.key===job.key);if(!photo||photo.phase==="error")continue;
      const controller=new AbortController();photoRequests.current.set(photo.key,controller);
      const live=()=>alive.current&&epoch===photoEpoch.current&&photoState.current.some(item=>item.key===photo.key);
      const patch=(data:Partial<DraftPhoto>)=>{if(live())updatePhotos(current=>current.map(item=>item.key===photo.key?{...item,...data}:item));};
      try{
        const result=await uploadPrivateMealPhoto(photo.file,()=>{}, {transport:job.transport,region:job.region,route:photo.route,signal:controller.signal,onPreview:body=>{if(live()&&!photoState.current.find(item=>item.key===photo.key)?.preview)patch({preview:URL.createObjectURL(body)});},onProgress:state=>patch({phase:state.phase,percent:state.percent,label:state.label,region:state.region,error:undefined,canRelay:false})});
        patch({id:result.id,phase:"ready",percent:100,label:"照片已就绪"});
      }catch(failure){patch({phase:"error",error:failure instanceof Error?failure.message:"照片上传未完成，请重试。",label:controller.signal.aborted?"已取消":"上传失败",canRelay:job.transport==="direct"&&failure instanceof PhotoTransferError&&failure.allowRelay});}
      finally{photoRequests.current.delete(photo.key);}
    }}finally{photoWorking.current=false;if(photoQueue.current.length&&alive.current)void processPhotos([]);}
  }
  async function retryPhoto(key:string,transport:"direct"|"relay"="direct",region?:PhotoRegion){const photo=photoState.current.find(item=>item.key===key);if(!photo||photo.phase!=="error")return;updatePhotos(current=>current.map(item=>item.key===key?{...item,phase:"queued",percent:0,label:"等待上传",error:undefined,canRelay:false}:item));await processPhotos([{key,transport,region:region??photo.region}]);}

  const releasePhotoResources=useCallback(()=>{photoEpoch.current++;photoQueue.current=[];for(const controller of photoRequests.current.values())controller.abort();for(const photo of [...photoState.current,...[...savedDrafts.current.values()].flatMap(value=>value.photos),...[...outbox.current.values()].flatMap(value=>value.photos)])if(photo.preview)URL.revokeObjectURL(photo.preview);},[]);
  const scrollState = useCallback(() => ({ ...scroll.current }), []);
  const recordScroll = useCallback((top:number,stick:boolean) => { scroll.current = { top,stick }; }, []);
  const restoreConversationDraft = useCallback((id:string) => {
    const restored = savedDrafts.current.get(id);
    setDraft(restored?.draft ?? "");
    setQuote(restored?.quote ?? null);
    photoState.current = restored?.photos ?? [];
    setPhotos(photoState.current);
    scroll.current = restored?.scroll ?? {top:0,stick:true};
    pendingRequest.current = null;
  },[]);
  const apply = useCallback((snapshot: ChatSnapshot) => {
    if (!alive.current) return;
    if(snapshot.entitlement&&!updateAccess(snapshot.entitlement)){deferredRead.current=true;return;}
    snapshots.current++;
    const delivery = request.current;
    if (delivery) {
      const reply = deliveredReply(snapshot, delivery);
      if (reply?.runId) {
        delivery.runId ??= reply.runId;
        delivery.terminal ||= reply.state !== "working";
        setSubmitting(false);
      } else if (delivery.runId && snapshot.conversationId === delivery.conversationId) {
        if (snapshot.activeRunId === delivery.runId) setSubmitting(false);
        else if (current.current?.activeRunId === delivery.runId) delivery.terminal = true;
      }
    }
    const changed = current.current?.conversationId !== snapshot.conversationId;
    if (changed) {
      cursors.current.clear();
      if (pendingResumeSource.current && pendingResumeSource.current === current.current?.conversationId) {
        pendingResumeSource.current = null;
        restoreConversationDraft(snapshot.conversationId);
      }
    }
    for (const message of [...(snapshot.photoUpdates ?? []), ...snapshot.messages]) {
      if (message.role === "assistant") cursors.current.set(message.id,{runId:message.runId,length:message.text.length});
      if (message.role !== "user" || !message.requestId) continue;
      const id = message.requestId;
      if (pendingRequest.current?.id === id) pendingRequest.current = null;
      updateOutgoing(id,value => value?.photos.some(photo=>photo.preview) ? {...value,phase:"accepted",error:undefined} : undefined);
    }
    current.current = snapshot; setData(snapshot);
    const restoredMessages = changed ? savedDrafts.current.get(snapshot.conversationId)?.older ?? [] : null;
    setMessages(previous => {
      const merged = new Map((restoredMessages ?? previous).map(row => [row.id, row]));
      for (const row of snapshot.photoUpdates ?? []) if (merged.has(row.id)) merged.set(row.id, row);
      for (const row of snapshot.messages) merged.set(row.id, row);
      return [...merged.values()].sort((a,b) => a.seq - b.seq).slice(-50);
    });
    delivery?.flushStop();
  }, [updateAccess,updateOutgoing,restoreConversationDraft]);
  const applyEvent = useCallback((event:ChatEvent) => {
    if (!alive.current) return false;
    if (event.type === "snapshot") apply(event.snapshot);
    else if (event.type === "usage" && current.current) {
      current.current = {...current.current,usage:event.usage};
      setData(current.current);
    } else if (event.type === "timing" && current.current?.activeRunId === event.timing.runId) {
      current.current = {...current.current,runTiming:event.timing};
      setData(current.current);
    } else if (event.type === "message") {
      cursors.current.set(event.message.id,{runId:event.message.runId,length:event.message.text.length});
      setMessages(previous => [...previous.filter(row=>row.id!==event.message.id),event.message].sort((a,b)=>a.seq-b.seq).slice(-50));
    } else if (event.type === "text_delta" || event.type === "progress") {
      const cursor = cursors.current.get(event.messageId);
      if (current.current?.activeRunId !== event.runId || !cursor || cursor.runId !== event.runId) return false;
      if (event.type === "text_delta") {
        if (event.offset + event.text.length <= cursor.length) return true;
        if (event.offset !== cursor.length) return false;
        cursor.length += event.text.length;
        setMessages(previous=>previous.map(row=>row.id===event.messageId?{...row,text:row.text+event.text}:row));
      } else {
        setMessages(previous=>previous.map(row=>row.id===event.messageId?{...row,steps:event.steps,references:event.references,photoProgress:event.photoProgress}:row));
      }
    }
    return true;
  },[apply]);
  const subscription = useRef<AbortController|null>(null);
  const read = useCallback(async function readChat(before?: number, manual = false): Promise<void> {
    const previous = reading.current;
    if (previous && (!manual || previous.manual)) {
      if (!manual && !before && !previous.manual) deferredRead.current = true;
      return;
    }
    if (!manual && (mutating.current || request.current || subscription.current && !before)) return;
    const controller = new AbortController(), operation = { controller, manual };
    const ticket = generation.current, seen = snapshots.current;
    reading.current = operation;
    setLoading(true);
    if (manual) {
      setRefreshing(true);
      previous?.controller.abort();
      subscription.current?.abort();
      subscription.current = null;
      // 已确认接收后只断开接收回复的连接。发送还未获确认时，让原请求继续。
      if (request.current?.runId) request.current.controller.abort();
    } else setError("");
    const query = new URLSearchParams();
    if (before) query.set("before", String(before));
    if (manual && current.current?.conversationId) query.set("conversationId", current.current.conversationId);
    const isCurrent = () => !controller.signal.aborted && alive.current && ticket === generation.current;
    try {
      const response = await fetch(chatEndpoint + (query.size ? "?" + query : ""), {
        cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      const payload = await response.json();
      if (!response.ok) throw Error(payload.error ?? "聊天暂时无法读取。");
      if (isCurrent()) {
        // 手动读取与仍在确认中的发送重叠时，保留随后到达的原请求快照。
        if (!manual || seen === snapshots.current) apply(payload);
        if (manual) setError("");
      }
    } catch (failure) {
      if (isCurrent()) setError(manual ? "暂时读不到对话，已有内容已保留。请重试。" :
        failure instanceof Error ? failure.message : "读取未完成，请重试。");
    } finally {
      if (reading.current === operation) {
        reading.current = null;
        if (alive.current) {
          setLoading(false);
          if (manual) setRefreshing(false);
          else if (deferredRead.current) {
            deferredRead.current = false;
            setTimeout(() => void readChat(), 0);
          }
        }
      }
    }
  }, [apply]);
  const refresh = useCallback(() => read(undefined, true), [read]);
  useEffect(()=>{
    const controller=new AbortController();let currentRequest=false;
    const sync=async()=>{if(document.hidden||currentRequest||controller.signal.aborted)return;currentRequest=true;try{const response=await fetch("/api/account/entitlements",{cache:"no-store",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(!response.ok)return;const value=await response.json();if(!controller.signal.aborted&&alive.current){const previous=accessRef.current?.version;const accepted=updateAccess(value.entitlement);if(accepted&&previous!==value.entitlement.version)void read();}}catch{/* 已知权限和草稿保持，后续请求仍由服务端复核。 */}finally{currentRequest=false;}};
    void sync();const foreground=()=>void sync(),timer=setInterval(foreground,60000);window.addEventListener("focus",foreground);document.addEventListener("visibilitychange",foreground);
    return()=>{controller.abort();clearInterval(timer);window.removeEventListener("focus",foreground);document.removeEventListener("visibilitychange",foreground);};
  },[accountId,updateAccess,read]);
  useEffect(() => {
    const update = () => document.documentElement.style.setProperty(
      "--assistant-viewport-height", (window.visualViewport?.height ?? innerHeight) + "px",
    );
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [enabled]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      request.current?.controller.abort();
      reading.current?.controller.abort();
      subscription.current?.abort();
      releasePhotoResources();
    };
  }, [accountId, releasePhotoResources]);
  useEffect(() => { if (!open) return; const frame = requestAnimationFrame(() => void read()); const focus = () => { if(document.hidden || request.current)return;void read(); }; window.addEventListener("focus", focus); window.addEventListener("pageshow",focus); window.addEventListener("online",focus); document.addEventListener("visibilitychange", focus); window.addEventListener("formward-record-saved", focus); return () => { cancelAnimationFrame(frame); window.removeEventListener("focus", focus); window.removeEventListener("pageshow",focus); window.removeEventListener("online",focus); document.removeEventListener("visibilitychange", focus); window.removeEventListener("formward-record-saved", focus); }; }, [enabled, open, read]);
  const resumeRunId = data?.runTiming?.runId;
  useEffect(() => {
    if (!open || !resumeRunId || running || refreshing) return;
    let closed = false, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function resume() {
      if (closed || controller.signal.aborted || reading.current?.manual || current.current?.activeRunId !== resumeRunId) return;
      subscription.current = controller;
      let done = false;
      try {
        const response = await fetch(chatEndpoint + "?runId=" + resumeRunId, {
          cache: "no-store", headers: streamHeaders, signal: controller.signal,
        });
        if (response.ok) done = await consumeChatEvents(response, event => !controller.signal.aborted && applyEvent(event));
      } catch { /* 读取原任务，连接失败时保留已经显示的正文。 */ }
      finally {
        if (subscription.current === controller) subscription.current = null;
        if (!closed && !done && !controller.signal.aborted) {
          await read();
          timer = setTimeout(() => void resume(),1200);
        }
      }
    }
    void resume();
    return () => {
      closed = true;
      clearTimeout(timer);
      controller.abort();
      if (subscription.current === controller) subscription.current = null;
    };
  },[open,resumeRunId,running,refreshing,applyEvent,read]);
  const legacyRun = !data?.runTiming ? data?.activeRunId : null;
  useEffect(() => {
    if (!open || !legacyRun || running) return;
    const timer = setInterval(() => {if (!document.hidden) void read();},1800);
    return () => clearInterval(timer);
  },[open,legacyRun,running,read]);
  useEffect(() => { if (!open) return; const timer = setInterval(() => { if (!document.hidden && !request.current) void read(); },60000); return () => clearInterval(timer); }, [enabled,open,read]);
  useEffect(() => { if (!open || !data?.usage.resetAt) return; const timer = setTimeout(() => { if (!request.current) void read(); },Math.max(1000,Date.parse(data.usage.resetAt)-Date.now()+200)); return () => clearTimeout(timer); }, [open,data?.usage.resetAt,read]);
  useEffect(() => { if (!loading) return; const timer = setTimeout(() => setDelayed(true), 200); return () => clearTimeout(timer); }, [loading]);
  useEffect(() => { if (!loading && delayed) { const frame = requestAnimationFrame(() => setDelayed(false)); return () => cancelAnimationFrame(frame); } }, [loading, delayed]);
  const unsent = [...outgoing.values()].some(item=>item.phase==="error");
  useEffect(() => { if (!draft.trim() && !photos.length && !unsent) return; const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; }; window.addEventListener("beforeunload", protect); return () => window.removeEventListener("beforeunload", protect); }, [draft, photos, unsent]);
  async function control(action: ChatControlAction | "remove_conversation", provider?: ChatProvider, conversationId?: string, sourceMessageId?: string, runId?: string) {
    if ((!canChat && action !== "stop" && action !== "remove_conversation") || mutating.current) return false;
    if (action === "stop" && (!runId || !conversationId)) return false;
    const resume = action === "resume_in_new_conversation";
    const switching = resume || action === "new" || action === "select_conversation";
    if (switching && (running || uploading)) return false;
    if (action === "remove_conversation" && [...outbox.current.values()].some(item =>
      item.body.conversationId === conversationId && item.phase !== "accepted"
    )) {
      setError("这段对话有未发出的消息。请先处理该消息再删除。");
      return false;
    }
    if (action === "new" && (draft.trim() || quote || photos.length || !conversationId && messages.some(row => row.references.some(ref => ref.kind === "preview")))) {
      if (!await confirmAction({ title: "开始新对话？", message: "当前草稿会留在原对话，已有提交仍可查看和确认。", confirmLabel: "开始新对话", cancelLabel: "继续当前对话" })) return false;
    }
    if (action === "revoke" && !await confirmAction({ title: "撤销站内授权？", message: "此模型将停止访问，原待确认提交也不能继续保存。", confirmLabel: "撤销授权", danger: true })) return false;
    if (mutating.current) return false;
    if (switching && current.current) savedDrafts.current.set(current.current.conversationId, {
      draft, quote, photos: [...photoState.current], scroll: { ...scroll.current },
      older: scroll.current.stick ? [] : messages,
    });
    if (resume) pendingResumeSource.current = current.current?.conversationId ?? null;
    mutating.current = true; setManaging(true); generation.current++;
    if (action === "stop") setStopping(true);
    try {
      setError("");
      const requestControl = () => fetch("/api/assistant-chat/control", {
        method:"POST", headers:{"Content-Type":"application/json"},
        signal: action === "stop" ? AbortSignal.timeout(15000) : undefined,
        body:JSON.stringify({action, ...(conversationId ? {conversationId} : {}), ...(sourceMessageId ? {sourceMessageId} : {}),
          ...(provider ? {provider} : {}), ...(runId ? {runId} : {})}),
      });
      const response = await requestControl().catch(error => {
        if (resume && navigator.onLine) return requestControl();
        throw error;
      });
      const payload = await response.json();
      if (!response.ok) {
        if (resume) pendingResumeSource.current = null;
        if (payload.code === "conversation_changed" || payload.code === "quote_unavailable") deferredRead.current = true;
        throw Error(payload.error ?? "操作未完成。");
      }
      if (switching && !resume) {
        pendingResumeSource.current = null;
        restoreConversationDraft(payload.conversationId);
        generation.current++;
      }
      if (action === "remove_conversation" && current.current?.conversationId !== payload.conversationId) {
        setQuote(null);
        scroll.current = { top: 0, stick: true };
        pendingRequest.current = null;
      }
      if (action === "stop" && payload.activeRunId !== runId) {
        const delivery = request.current;
        if (delivery && delivery.runId === runId) {
          delivery.terminal = true;
          setSubmitting(false);
          delivery.controller.abort();
        }
        if (current.current?.activeRunId === runId) {
          subscription.current?.abort();
          subscription.current = null;
        }
      }
      generation.current++;
      apply(payload); return true;
    } catch (failure) {
      if (alive.current) setError(action === "stop" ? "暂时无法确认是否已停止。请重新读取对话。" :
        failure instanceof Error ? failure.message : "操作未完成，请重试。");
      return false;
    } finally {
      mutating.current = false;
      if (alive.current) {
        if (action === "stop") setStopping(false);
        setManaging(false);
        if (deferredRead.current) { deferredRead.current = false; void read(); }
      }
    }
  }
  function stop() {
    if (mutating.current) return;
    const delivery = request.current;
    if (delivery) {
      if (delivery.terminal || delivery.stopQueued) return;
      if (delivery.runId) void control("stop", undefined, delivery.conversationId, undefined, delivery.runId);
      else {
        delivery.stopQueued = true;
        setStopping(true);
      }
      return;
    }
    const snapshot = current.current, runId = activeConversationRun(snapshot);
    if (snapshot && runId) void control("stop", undefined, snapshot.conversationId, undefined, runId);
  }

  function releaseSentPreview(id:string,imageId:string) {
    const item = outbox.current.get(id);
    const photo = item?.photos.find(value=>value.id===imageId);
    if (!item || item.phase !== "accepted" || !photo?.preview) return;
    for (const attachment of item.photos) if (attachment.id===imageId && attachment.preview) URL.revokeObjectURL(attachment.preview);
    updateOutgoing(id,value => {
      if (!value) return;
      const kept = value.photos.filter(value=>value.id!==imageId);
      return kept.some(value=>value.preview) ? {...value,photos:kept} : undefined;
    });
  }

  async function transmit(body:SendBody, local?:OutgoingMessage) {
    if (request.current || mutating.current || !canChat || current.current?.activeRunId) return false;
    const controller = new AbortController();
    const delivery: Delivery = { controller, conversationId: body.conversationId, requestId: body.requestId, flushStop };
    request.current = delivery;
    generation.current++;
    setRunning(true);
    setSubmitting(true);
    function flushStop() {
      if (!delivery.stopQueued || !delivery.runId) return;
      delivery.stopQueued = false;
      if (delivery.terminal) setStopping(false);
      else void control("stop", undefined, delivery.conversationId, undefined, delivery.runId).then(() => {
        if (alive.current) setStopping(false);
      });
    }
    setError("");
    if (local) updateOutgoing(body.requestId,() => ({...local,phase:"sending",error:undefined}));
    let accepted = false, failure = "";
    try {
      const response = await fetch(chatEndpoint, {
        method:"POST",headers:{"Content-Type":"application/json", ...streamHeaders},signal:controller.signal,body:JSON.stringify(body),
      });
      if (!response.ok) {
        const value = await response.json();
        throw Error(value.error??"发送未完成。");
      }
      accepted = true;
      if (pendingRequest.current?.id === body.requestId) pendingRequest.current = null;
      if (local) updateOutgoing(body.requestId,value=>value?{...value,phase:"accepted",error:undefined}:undefined);
      await consumeChatEvents(response, event => {
        if (controller.signal.aborted || !alive.current) return false;
        if (event.type === "accepted") {
          if (event.conversationId !== delivery.conversationId || event.requestId !== delivery.requestId) return false;
          delivery.runId = event.runId;
          flushStop();
          return true;
        }
        return applyEvent(event) && !delivery.terminal;
      });
    } catch (cause) {
      failure = cause instanceof Error && !controller.signal.aborted ? cause.message : "连接暂时中断。";
    } finally {
      if (request.current === delivery) request.current = null;
      if (alive.current) {
        setSubmitting(false);
        await read();
        if (delivery.stopQueued) {
          const reply = deliveredReply(current.current, delivery);
          if (reply?.runId && reply.runId === activeConversationRun(current.current)) {
            delivery.runId = reply.runId;
            flushStop();
          } else setStopping(false);
        }
        const pending = outbox.current.get(body.requestId);
        accepted ||= pending?.phase === "accepted" || current.current?.messages.some(message=>message.requestId===body.requestId)===true;
        if (local && !accepted) updateOutgoing(body.requestId,value=>value?{
          ...value,phase:"error",error:failure||"发送未完成。",
        }:undefined);
        if (!local && !accepted && failure) setError(failure);
        setRunning(false);
        window.dispatchEvent(new Event("formward-assistant-updated"));
      }
    }
    return accepted;
  }

  async function send(action: "send" | "retry" | "continue" = "send", messageId?: string,followup?:FollowupSubmission,
    options?:{imageSubset?:string[];viewport?:ArrivalViewport}) {
    const snapshot = current.current;
    if (!snapshot || request.current || mutating.current || snapshot.activeRunId || !canChat) return false;
    const ordinary = action === "send" && !followup;
    const contextQuote = ordinary ? snapshot.pendingContextQuote : undefined;
    if (contextQuote?.text === null) return false;
    const reply = contextQuote?.text ? { id: contextQuote.id, text: contextQuote.text, contextQuote: true as const }
      : quote ? { id: quote.id, text: quote.text } : null;
    const captured = ordinary ? [...photoState.current] : [];
    if (ordinary && ((!draft.trim() && !captured.length) || captured.some(photo=>photo.phase!=="ready"||!photo.id))) return false;
    try { if (followup) resolveSupplement(snapshot.followup,followup); }
    catch (failure) { setError(failure instanceof Error?failure.message:"补充任务已变化。"); return false; }

    const payload = {
      action,provider:snapshot.provider,conversationId:snapshot.conversationId,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
      ...(ordinary?{text:draft,imageIds:[...new Set(captured.map(photo=>photo.id!))],...(reply ? {replyToId:reply.id} : {})}:
        followup?{followup}:{messageId,...(options?.imageSubset?{imageSubset:options.imageSubset}:{})}),
    };
    const signature = JSON.stringify(payload);
    if (pendingRequest.current?.signature !== signature || ordinary && outbox.current.has(pendingRequest.current.id))
      pendingRequest.current = {signature,id:crypto.randomUUID()};
    const body:SendBody = {...payload,requestId:pendingRequest.current!.id};
    scroll.current.stick = true;
    if (!ordinary) return transmit(body);
    const local:OutgoingMessage = {
      body,photos:captured,quote,viewport:options?.viewport,phase:"sending",
      message:{id:"local-"+body.requestId,requestId:body.requestId,seq:(messages.at(-1)?.seq??0)+1,role:"user",text:draft,
        provider:null,state:"complete",createdAt:new Date().toISOString(),replyTo:reply,
        imageIds:body.imageIds??[],steps:[],references:[],error:null},
    };
    setDraft("");
    setQuote(null);
    updatePhotos(() => []);
    setNewRequests(previous=>new Set([...previous,body.requestId].slice(-50)));
    return transmit(body,local);
  }

  async function retryOutgoing(id:string) {
    const item = outbox.current.get(id);
    if (item?.phase !== "error" || item.body.conversationId !== current.current?.conversationId) return false;
    return transmit(item.body,item);
  }
  async function restoreOutgoing(id:string) {
    await read();
    const item = outbox.current.get(id);
    if (item?.phase !== "error" || item.body.conversationId !== current.current?.conversationId) return;
    if (draft.trim() || quote || photoState.current.length) {
      updateOutgoing(id,value=>value?{...value,error:"输入框已有草稿。发送或清空当前草稿后，可恢复这条消息。"}:undefined);
      return;
    }
    setDraft(item.message.text);
    setQuote(item.quote);
    updatePhotos(() => item.photos);
    updateOutgoing(id,() => undefined);
  }
  async function addPhotos(files:File[]){
    if(photoState.current.length+files.length>CHAT_PHOTO_LIMIT){setError(`每条消息最多${CHAT_PHOTO_LIMIT}张照片。`);return;}
    setError("");const route=choosePhotoRoute();void route.catch(()=>{});const incoming=files.map(file=>({key:crypto.randomUUID(),file,route,name:file.name,phase:"queued" as const,percent:0,label:"等待上传"}));
    updatePhotos(current=>[...current,...incoming]);
    const epoch=photoEpoch.current;
    // 网络串行，但原文件在选图当下读取，后续排队与重新选图不使Safari文件失效。
    for(const photo of incoming)void stagePrivateMealPhoto(photo.file).then(body=>{
      if(!alive.current||epoch!==photoEpoch.current)return;
      const current=photoState.current.find(item=>item.key===photo.key);
      if(current&&!current.preview){const preview=URL.createObjectURL(body);updatePhotos(items=>items.map(item=>item.key===photo.key?{...item,preview}:item));}
    },failure=>{
      if(alive.current&&epoch===photoEpoch.current)updatePhotos(items=>items.map(item=>item.key===photo.key?{...item,phase:"error",label:"读取失败",error:failure instanceof Error?failure.message:"照片读取未完成，请重新选择。"}:item));
    });
    await processPhotos(incoming.map(photo=>({key:photo.key,transport:"direct"})));
  }
  const stored = new Set(messages.flatMap(row => row.requestId ? [row.requestId] : []));
  const localMessages = [...outgoing.values()].filter(item=>item.body.conversationId===data?.conversationId && !stored.has(item.body.requestId))
    .map(item=>item.message);
  return <Context.Provider value={{accountId,scrollState,recordScroll,enabled:canChat,entitlement:access,data,
    messages:localMessages.length?[...messages,...localMessages].sort((a,b)=>a.seq-b.seq || a.createdAt.localeCompare(b.createdAt)):messages,newRequests,claimArrival,draft,setDraft,quote,setQuote,
    photos,removePhoto,retryPhoto,error,loading,delayed,busy:running||!!data?.activeRunId,managing,uploading,
    refreshing,refresh,stopping,stop,canStop:submitting || !!activeConversationRun(data),more:async()=>{if(messages[0])await read(messages[0].seq);},send,control,addPhotos,
    outgoing,retryOutgoing,restoreOutgoing,releaseSentPreview,
  }}>{children}</Context.Provider>;
}
