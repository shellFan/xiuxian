import fs from 'fs'; import path from 'path'; import Ajv from 'ajv/dist/2020'; import {dirs} from './config';
const ajv=new Ajv({allErrors:true,strict:false}); const load=(name:string)=>JSON.parse(fs.readFileSync(path.join(dirs.schemas,name),'utf8')); const taskValidate=ajv.compile(load('task.schema.json')); const reviewValidate=ajv.compile(load('reviewer.schema.json')); const developerValidate=ajv.compile(load('developer.schema.json'));
export function validateTask(value:unknown):void {if(!taskValidate(value)) throw new Error(`Task schema invalid: ${ajv.errorsText(taskValidate.errors)}`)}
export function validateReview(value:unknown):void {if(!reviewValidate(value)) throw new Error(`Review schema invalid: ${ajv.errorsText(reviewValidate.errors)}`)}
export function validateDeveloper(value:unknown):void {if(!developerValidate(value)) throw new Error(`Developer schema invalid: ${ajv.errorsText(developerValidate.errors)}`)}
