import fs from 'fs'; import path from 'path'; import Ajv from 'ajv/dist/2020'; import {dirs} from './config';
const ajv=new Ajv({allErrors:true,strict:false}); const taskValidate=ajv.compile(JSON.parse(fs.readFileSync(path.join(dirs.schemas,'task.schema.json'),'utf8'))); const reviewValidate=ajv.compile(JSON.parse(fs.readFileSync(path.join(dirs.schemas,'reviewer.schema.json'),'utf8')));
export function validateTask(value:unknown):void {if(!taskValidate(value)) throw new Error(`Task schema invalid: ${ajv.errorsText(taskValidate.errors)}`)}
export function validateReview(value:unknown):void {if(!reviewValidate(value)) throw new Error(`Review schema invalid: ${ajv.errorsText(reviewValidate.errors)}`)}
