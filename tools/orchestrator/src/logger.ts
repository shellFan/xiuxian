import fs from 'fs'; import path from 'path'; import { dirs } from './config';
export function redact(value:string):string { return value.replace(/(token|password|api[_-]?key|cookie|secret)\s*[:=]\s*[^\s,]+/gi,'$1=[REDACTED]'); }
export function log(taskId:string, message:string):void { fs.mkdirSync(dirs.logs,{recursive:true}); const file=path.join(dirs.logs,`${taskId}-${new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14)}.log`); fs.appendFileSync(file,`${new Date().toISOString()} ${redact(message)}\n`); }
