"use client";
import {createContext,useContext} from 'react';
export const BodyFatContext=createContext(true);
export const useBodyMetrics=()=>useContext(BodyFatContext)?['weightKg','bodyFatPercent'] as const:['weightKg'] as const;
