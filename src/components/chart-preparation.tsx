"use client";

import {LocalLoading} from "./local-loading";

/** After a server read, chart dimensions are measured without covering the final plot. */
export function ChartPreparation({active}:{active:boolean}){
  return active ? <div className="chart-preparation"><LocalLoading/></div> : null;
}
