"use client";
import {createContext} from 'react';
/** 已核验账号的界面能力，不保存健康值或上游连接凭据。 */
export const WorkspaceSourceContext=createContext(false);

/** 服务端已知今天，客户端继续按实际时区更新。 */
export const WorkspaceTodayContext=createContext("");
