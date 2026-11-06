"use server";
import {headers} from 'next/headers';
import {revalidatePath} from 'next/cache';
import {getDatabase} from '@/db/client';
import {withCurrentSession} from '@/features/auth/server';
import {isAccountRequestOrigin} from '@/features/auth/site-url';
import {accountFailure} from '@/features/auth/account-management';
import {ApiError} from '@/features/auth/ai-identity';
import {loadAccountPreferences,saveAccountPreferences} from '@/features/auth/preferences';
export async function loadPreferencesAction(){try{return await withCurrentSession(await headers(),async(_user,proof)=>({ok:true as const,data:await loadAccountPreferences(getDatabase(),proof)}));}catch(error){return accountFailure(error);}}
export async function savePreferencesAction(input:unknown){try{const h=await headers();if(!isAccountRequestOrigin(h))throw new ApiError(403,'forbidden','请求来源无效。');return await withCurrentSession(h,async(_user,proof)=>{const data=await saveAccountPreferences(getDatabase(),proof,input);revalidatePath('/dashboard/measurements');return {ok:true as const,data};});}catch(error){return accountFailure(error);}}
