import {Review} from './types'; export function fixContext(review:Review):string{return `Required fixes:\n${[...review.blocker,...review.high,...review.requiredFixes].map(x=>`- ${x}`).join('\n')}`}
