// Central permission rules: who may operate which account for what purpose.
// Player and AI actions both pass through these checks.
import type { AccountRef, Id, Ministry, World } from './types';

export type Perm =
  | 'trade' // sell/buy goods, list inventory
  | 'money' // move money out
  | 'manage' // hire/fire, wages, prices, upgrades
  | 'produce' // work as manager
  | 'own' // sell/transfer the asset itself
  | 'exchange' // currency exchange
  | 'build' // start construction (nations)
  | 'war' // launch invasions, set battle priorities
  | 'appoint' // cabinet appointments
  | 'publicTrade' // trade national storage on markets
  | 'propose' // draft congress proposals
  | 'diplomacy'
  | 'recruit'
  | 'pr'
  | 'nuke'
  | 'police' // national police operations: raids, funding, pardons
  | 'intel'; // intelligence operations and agency budget

/** Which ministries can exercise each national permission (president always can). */
export const MINISTRY_PERMS: Record<Ministry, Perm[]> = {
  vp: ['build', 'war', 'exchange', 'publicTrade', 'diplomacy', 'recruit', 'pr', 'propose', 'money', 'police', 'intel'],
  development: ['build'],
  defense: ['war', 'nuke'],
  economy: ['exchange', 'money'],
  labor: ['publicTrade', 'trade'],
  pr: ['pr'],
  recruitment: ['recruit'],
  interior: ['police'],
  intelligence: ['intel'],
  foreign: ['diplomacy'],
};

export const MINISTRY_INFO: Record<Ministry, { name: string; desc: string }> = {
  vp: { name: 'Vice President', desc: 'Shares most executive powers' },
  development: { name: 'Minister of Development', desc: 'Starts and funds regional construction' },
  defense: { name: 'Minister of Defense', desc: 'Launches invasions, battle priorities, nuclear operations' },
  economy: { name: 'Minister of Economy', desc: 'Treasury currency exchange and holdings' },
  labor: { name: 'Minister of Labor', desc: 'Trades national storage on markets' },
  pr: { name: 'Minister of Public Relations', desc: 'Government communications' },
  recruitment: { name: 'Minister of Recruitment', desc: 'Immigration and citizenship approvals' },
  interior: { name: 'Minister of the Interior', desc: 'National police: funding, raids on organised crime, federal investigations' },
  intelligence: { name: 'Director of Intelligence', desc: 'Runs the intelligence service: budget, operations, counter-intelligence' },
  foreign: { name: 'Foreign Minister', desc: 'Conducts foreign policy: treaties, sanctions, summits and statements; a skilled one builds diplomatic capital faster and briefs the government better' },
};

export function nationPerm(w: World, actor: Id, nation: Id, perm: Perm): boolean {
  const n = w.nations[nation];
  if (!n) return false;
  if (n.president === actor) return true; // the president also sits in congress
  for (const [m, id] of Object.entries(n.cabinet)) {
    if (id === actor && MINISTRY_PERMS[m as Ministry].includes(perm)) return true;
  }
  if (perm === 'propose') return n.deputies.includes(actor);
  return false;
}

/** Actor id used by the simulation itself for background households. */
export const SYSTEM = -1;

/** Returns null if allowed, otherwise the reason. */
export function authorize(w: World, actor: Id, ref: AccountRef, perm: Perm): string | null {
  switch (ref.k) {
    case 'hh':
      return actor === SYSTEM ? null : 'Background households are simulation-controlled.';
    case 'cit':
      return ref.id === actor ? null : 'You can only act for yourself.';
    case 'co': {
      const co = w.companies[ref.id];
      if (!co) return 'Company not found.';
      if (co.owner.k === 'cit') return co.owner.id === actor ? null : 'You do not own this company.';
      if (co.owner.k === 'hold') {
        const h = w.holdings[co.owner.id];
        if (!h) return 'Owner holding missing.';
        if (h.ceo === actor || h.roles.vice === actor) return null;
        if (perm === 'trade' && h.roles.salesman === actor) return null;
        if ((perm === 'produce' || perm === 'manage') && h.roles.manager === actor) return null;
        if (perm === 'money' && h.roles.accountant === actor) return null;
        return 'Your holding role does not permit this.';
      }
      if (co.owner.k === 'nat') return nationPerm(w, actor, co.owner.id, perm === 'trade' ? 'publicTrade' : 'build') ? null : 'Requires a government office.';
      return 'Not permitted.';
    }
    case 'hold': {
      const h = w.holdings[ref.id];
      if (!h) return 'Holding not found.';
      if (h.ceo === actor || h.roles.vice === actor) return null;
      if (perm === 'trade' && h.roles.salesman === actor) return null;
      if (perm === 'money' && h.roles.accountant === actor) return null;
      if (perm === 'manage' && h.roles.manager === actor) return null;
      return 'Your holding role does not permit this.';
    }
    case 'nat':
      return nationPerm(w, actor, ref.id, perm) ? null : 'Requires a government office with this authority.';
    case 'unit': {
      const u = w.units[ref.id];
      if (!u) return 'Unit not found.';
      return u.commander === actor || u.officers.includes(actor) ? null : 'Only unit officers can do this.';
    }
    default:
      return 'Not permitted.';
  }
}
