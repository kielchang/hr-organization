import { useContext } from 'react';
import { OrgContext } from './orgContextState';

export function useOrg() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
