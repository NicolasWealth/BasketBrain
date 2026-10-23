'use client';
import { createContext, Dispatch, ReactNode, useContext, useReducer } from 'react';
import { BasketItem, BasketState, createBasketState } from '../lib/basket';
import { rejectRecommendation, Recommendation } from '../lib/recommendations';
type Session = BasketState & { recommendations: Recommendation[]; rejected: string[]; sample: boolean };
type Action = { type: 'start'; currency: BasketState['currency']; budgetMinor: number; items?: BasketItem[]; sample?: boolean } | { type: 'replace'; state: BasketState; recommendations?: Recommendation[] } | { type: 'recommendations'; recommendations: Recommendation[] } | { type: 'reject'; id: string };
const Context = createContext<{ state?: Session; dispatch: Dispatch<Action> }>({ dispatch: () => undefined });
function reducer(state: Session | undefined, action: Action): Session | undefined { if (action.type === 'start') return { ...createBasketState(action.currency, action.budgetMinor), items: action.items ?? [], recommendations: [], rejected: [], sample: !!action.sample }; if (!state) return state; if (action.type === 'replace') return { ...state, ...action.state, recommendations: action.recommendations ?? state.recommendations }; if (action.type === 'recommendations') return { ...state, recommendations: action.recommendations }; if (action.type === 'reject') return { ...state, rejected: [...state.rejected, action.id], recommendations: rejectRecommendation(state.recommendations, action.id) }; return state; }
export function SessionProvider({ children }: { children: ReactNode }) { const [state, dispatch] = useReducer(reducer, undefined); return <Context.Provider value={{ state, dispatch }}>{children}</Context.Provider>; }
export const useSession = () => useContext(Context);
