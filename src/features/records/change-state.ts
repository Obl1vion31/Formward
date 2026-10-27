export type RecordStamp={key:string;id:string;date:string;title:string;version:string;summary?:string;href:string};
export function changedRecords(before:RecordStamp[],after:RecordStamp[]) {
 const old=new Map(before.map(row=>[row.key,row])),next=new Map(after.map(row=>[row.key,row]));
 return [...new Set([...old.keys(),...next.keys()])].filter(key=>old.get(key)?.version!==next.get(key)?.version).map(key=>({record:next.get(key)??old.get(key)!,kind:!next.has(key)?"删除":!old.has(key)?"新增":"修改"}));
}
