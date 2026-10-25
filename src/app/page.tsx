'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { parseMoneyToMinor, SupportedCurrency } from '../lib/basket';
import { loadSampleBasket } from '../lib/catalogue';
import { useSession } from './SessionProvider';

export default function Home() {
  const router = useRouter();
  const { dispatch } = useSession();
  const [currency, setCurrency] = useState<SupportedCurrency>('GBP');
  const [budget, setBudget] = useState('');
  const [error, setError] = useState('');

  function start(sample = false) {
    try {
      const sampleBudgets: Record<SupportedCurrency, string> = { GBP: '11.00', USD: '16.00', EUR: '14.50', NGN: '19000' };
      const budgetMinor = parseMoneyToMinor(sample ? sampleBudgets[currency] : budget, currency);
      dispatch({ type: 'start', currency, budgetMinor, items: sample ? loadSampleBasket(currency) : [], sample });
      router.push('/basket');
    } catch {
      setError('Enter a budget such as 35.00.');
    }
  }

  return <main className="landing"><div className="card"><p className="brand">BasketBrain</p><h1>Keep your grocery shop on budget.</h1><p>Set a budget, add the groceries you buy and the prices you actually paid, then review savings ideas if you go over.</p><p className="notice">Replacement prices are illustrative comparisons, not live store prices.</p><label>Choose a currency<select value={currency} onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}>{['GBP', 'USD', 'EUR', 'NGN'].map((value) => <option key={value}>{value}</option>)}</select></label><label>Your grocery budget<input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="35.00" inputMode="decimal" /></label>{error && <p role="alert">{error}</p>}<button onClick={() => start()}>Add my groceries</button><button className="secondary" onClick={() => start(true)}>Try a sample grocery basket</button></div></main>;
}
