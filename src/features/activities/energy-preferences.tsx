"use client";
import {createContext,useState,type ReactNode} from "react";
import type {CalculationMethod,RestingMethod} from "./calculation-model";
export type EnergyPreferences={restingMethod:RestingMethod;formula:CalculationMethod};
export const EnergyPreferencesContext=createContext<{value:EnergyPreferences;update:(value:EnergyPreferences)=>void}>({value:{restingMethod:"estimate",formula:"auto"},update:()=>{}});
/** 方式属于账号设置，从首帧传给普通编辑器和等待表单，避免接管后增加一整行。 */
export function EnergyPreferencesProvider({initial,children}:{initial:EnergyPreferences;children:ReactNode}){
 const [value,setValue]=useState(initial);
 const [serverValue,setServerValue]=useState(initial);
 if(serverValue.restingMethod!==initial.restingMethod||serverValue.formula!==initial.formula){setServerValue(initial);setValue(initial);}
 function update(next:EnergyPreferences){setValue(current=>current.restingMethod===next.restingMethod&&current.formula===next.formula?current:next);}
 return <EnergyPreferencesContext value={{value,update}}>{children}</EnergyPreferencesContext>;
}
