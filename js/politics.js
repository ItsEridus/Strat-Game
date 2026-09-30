// Parties, elections, congress laws and AI government decisions.
(function () {
  const G = globalThis.G;
  const U = G.util;
  const D = G.data;

  function S() { return G.state; }
  function P() { return G.state.player; }
  const PN = () => G.world.playerNation();

  const LAW_TEXT = {
    war: (l) => `Declare war on ${S().nations[l.target].name}`,
    peace: (l) => `Sign peace with ${S().nations[l.target].name}`,
    incomeTax: (l) => `Set income tax to ${U.pct(l.value)}`,
    vat: (l) => `Set VAT to ${U.pct(l.value)}`,
  };

  // ---------- parties ----------
  function joinParty(pid) {
    const p = P();
    if (p.level < 3) return G.fail('Reach level 3 to join a party.');
    if (!PN().parties.some((x) => x.id === pid)) return;
    p.party = pid;
    return G.ok(`You joined the ${PN().parties.find((x) => x.id === pid).name}.`);
  }
  function leaveParty() {
    const p = P();
    p.party = null; p.candidateCongress = false; p.candidatePresident = false;
    return G.ok('You left your party.');
  }
  function toggleCandidacy(kind) {
    const p = P();
    if (p.party === null) return G.fail('Join a party first.');
    if (kind === 'congress') {
      if (p.level < 5) return G.fail('Reach level 5 to run for congress.');
      p.candidateCongress = !p.candidateCongress;
      return G.ok(p.candidateCongress ? 'You are running for congress.' : 'Candidacy withdrawn.');
    }
    if (p.level < 8) return G.fail('Reach level 8 to run for president.');
    p.candidatePresident = !p.candidatePresident;
    return G.ok(p.candidatePresident ? 'You are running for president!' : 'Candidacy withdrawn.');
  }

  function daysUntil(kind) {
    const c = D.ELECTION_CYCLE;
    const offset = kind === 'president' ? 0 : c / 2;
    const d = S().day % c;
    return (offset - d + c) % c || c;
  }

  // Player's electoral weight relative to typical AI candidates.
  function playerScore() {
    const p = P();
    return p.pop + p.level * 1.5 + p.stats.heroes * 2 + (p.congress ? 10 : 0);
  }

  function congressElection() {
    const n = PN();
    const p = P();
    if (!n.alive) return;
    // Parties drift; the player's party gets a boost from the player's popularity.
    for (const party of n.parties) party.popularity = U.clamp(party.popularity * U.rand(0.85, 1.15), 5, 80);
    const extra = {};
    if (p.party !== null) extra[p.party] = p.pop * 0.3;
    G.world.assignSeats(n, extra);
    const wasCongress = p.congress;
    p.congress = false;
    if (p.candidateCongress && p.party !== null) {
      const chance = U.clamp(playerScore() / (playerScore() + 40) + (n.seats[p.party] || 0) * 0.02, 0.05, 0.95);
      p.congress = U.chance(chance);
      G.report(p.congress
        ? `🏛️ You won a seat in the ${n.name} congress! (chance was ${U.pct(chance)})`
        : `🏛️ You lost the congress election (chance was ${U.pct(chance)}).`);
      if (p.congress) G.news(`🏛️ ${p.name} elected to congress.`, 'player');
    } else if (wasCongress) {
      G.report('🏛️ Your congress term ended.');
    }
    G.news(`🏛️ ${n.name} congressional elections held. Largest party: ${largestParty(n).name}.`, 'politics');
    G.achievements.check();
  }

  function largestParty(n) {
    return n.parties.reduce((a, b) => ((n.seats[a.id] || 0) >= (n.seats[b.id] || 0) ? a : b));
  }

  function presidentialElections() {
    const p = P();
    for (const n of S().nations) {
      if (!n.alive) continue;
      const isPlayerNation = n.id === p.nation;
      const wasPlayer = n.president.player;
      if (isPlayerNation && p.candidatePresident && p.party !== null) {
        const rivals = [U.rand(25, 70), U.rand(20, 60)];
        const mine = playerScore() * 1.2 + (n.seats[p.party] || 0) * 2 + (wasPlayer ? 10 : 0);
        const share = mine / (mine + rivals[0] + rivals[1]);
        const won = U.chance(U.clamp(share * 1.6, 0.03, 0.95));
        if (won) {
          n.president = { name: p.name, player: true, since: S().day };
          p.stats.termsServed++;
          G.report(`👑 You were elected President of ${n.name} with ${U.pct(share)} of the vote!`);
          G.news(`👑 ${p.name} elected President of ${n.name}.`, 'politics');
        } else {
          n.president = { name: G.world.personName(), player: false, since: S().day };
          G.report(`🗳️ You lost the presidential election (${U.pct(share)} of the vote). ${n.president.name} wins.`);
          G.news(`🗳️ ${n.president.name} elected President of ${n.name}.`, 'politics');
        }
      } else if (wasPlayer || U.chance(0.5)) {
        n.president = { name: G.world.personName(), player: false, since: S().day };
        if (wasPlayer) G.report('👑 Your presidential term has ended.');
        G.news(`🗳️ ${n.president.name} elected President of ${n.name}.`, 'politics');
      }
    }
    G.achievements.check();
  }

  // ---------- laws (player's nation only) ----------
  function propose(type, target, value, byPlayer) {
    const n = PN();
    if (S().laws.some((l) => l.type === type && l.target === target)) return byPlayer ? G.fail('Such a law is already being voted on.') : null;
    const law = { id: U.nextId(), nation: n.id, type, target, value, byPlayer, day: S().day, myVote: null };
    S().laws.push(law);
    if (!byPlayer) {
      G.report(`📜 New proposal in congress: ${LAW_TEXT[type](law)}.`);
    } else {
      G.news(`📜 President ${P().name} proposed: ${LAW_TEXT[type](law)}.`, 'politics');
    }
    return law;
  }

  function playerPropose(type, target, value) {
    const n = PN();
    if (!n.president.player) return G.fail('Only the president can propose laws.');
    if (type === 'war') {
      if (G.world.atWar(n.id, target)) return G.fail('Already at war.');
      if (!G.world.neighborNations(n.id).includes(target)) return G.fail('You can only declare war on neighbours.');
    }
    if (type === 'peace' && !G.world.atWar(n.id, target)) return G.fail('Not at war with that nation.');
    if (type === 'incomeTax') value = U.clamp(value, 0, 0.5);
    if (type === 'vat') value = U.clamp(value, 0, 0.3);
    if (propose(type, target, value, true)) return G.ok('Proposal sent to congress. It will be voted at the end of the day.');
  }

  function vote(lawId, yes) {
    const p = P();
    if (!p.congress) return G.fail('Only congress members can vote.');
    const l = S().laws.find((x) => x.id === lawId);
    if (!l) return;
    l.myVote = yes;
    return G.ok(`You voted ${yes ? 'YES' : 'NO'}.`);
  }

  function yesChance(law, party, n) {
    const hawk = party.hawk;
    let c;
    switch (law.type) {
      case 'war': c = 0.1 + hawk * 0.8; break;
      case 'peace': c = 0.2 + (1 - hawk) * 0.7; break;
      case 'incomeTax': c = law.value > n.incomeTax ? 0.35 + hawk * 0.2 : 0.55; break;
      case 'vat': c = law.value > n.vat ? 0.35 + hawk * 0.2 : 0.55; break;
      default: c = 0.5;
    }
    if (law.byPlayer) {
      c += 0.1 + Math.min(0.2, P().pop / 300);
      if (party.id === P().party) c = Math.max(c, 0.9);
    }
    return U.clamp(c, 0.02, 0.98);
  }

  function resolveLaws() {
    const n = PN();
    const p = P();
    for (const law of S().laws) {
      if (law.day >= S().day && !law.byPlayer) continue; // give the player a day to vote on AI proposals
      let yes = 0, no = 0;
      let playerSeatTaken = false;
      for (const party of n.parties) {
        const seats = n.seats[party.id] || 0;
        for (let i = 0; i < seats; i++) {
          if (p.congress && !playerSeatTaken && party.id === p.party && law.myVote !== null) {
            playerSeatTaken = true;
            law.myVote ? yes++ : no++;
            continue;
          }
          U.chance(yesChance(law, party, n)) ? yes++ : no++;
        }
      }
      law.done = true;
      const passed = yes > no;
      G.report(`📜 ${LAW_TEXT[law.type](law)}: ${passed ? 'PASSED' : 'REJECTED'} (${yes}-${no}).`);
      G.news(`📜 ${n.name} congress ${passed ? 'passed' : 'rejected'}: ${LAW_TEXT[law.type](law)} (${yes}-${no}).`, 'politics');
      if (passed) applyLaw(law, n);
    }
    S().laws = S().laws.filter((l) => !l.done);
  }

  function applyLaw(law, n) {
    if (law.type === 'war') G.military.declareWar(n.id, law.target);
    if (law.type === 'peace') G.military.makePeace(n.id, law.target);
    if (law.type === 'incomeTax') n.incomeTax = law.value;
    if (law.type === 'vat') n.vat = law.value;
  }

  // ---------- AI governments ----------
  function nationStrength(nid) {
    return G.world.regionCount(nid) * 1000 + S().nations[nid].treasury * 0.1;
  }

  function dailyNations() {
    const S_ = S();
    const p = P();
    for (const n of S_.nations) {
      if (!n.alive) continue;
      const regions = G.world.regionCount(n.id);
      n.treasury += regions * (600 * n.incomeTax + 400 * n.vat) * U.rand(0.8, 1.2);
      // Wages drift with taxes and national size.
      const targetWage = (26 + Math.sqrt(regions) * 3) * (1.1 - n.incomeTax) * (1 + S_.day / 1000);
      n.avgWage += (targetWage - n.avgWage) * 0.05;

      const playerRuns = n.president.player;
      const isPlayerNation = n.id === p.nation;
      if (playerRuns) continue;

      const wars = G.world.warsOf(n.id);
      // Declare war.
      if (wars.length < 2 && U.chance(0.015 * n.aggression * (wars.length ? 0.4 : 1))) {
        const nbs = G.world.neighborNations(n.id).filter((x) => !G.world.atWar(n.id, x));
        if (nbs.length) {
          const t = U.weighted(nbs, (x) => nationStrength(n.id) / (nationStrength(x) + 1));
          if (isPlayerNation) propose('war', t, null, false);
          else G.military.declareWar(n.id, t);
        }
      }
      // Seek peace when the war drags on or goes badly.
      for (const w of wars) {
        const enemy = w.a === n.id ? w.b : w.a;
        const age = S_.day - w.since;
        const losing = G.world.regionCount(n.id) < G.world.regionCount(enemy);
        const p_ = age > 8 ? 0.02 + (losing ? 0.03 : 0) + (1 - n.aggression) * 0.02 : 0;
        if (U.chance(p_)) {
          if (isPlayerNation) propose('peace', enemy, null, false);
          else {
            const other = S_.nations[enemy];
            // The enemy must agree too — a player-led enemy never auto-accepts.
            if (other.president.player) propose('peace', n.id, null, false);
            else if (U.chance(0.6)) G.military.makePeace(n.id, enemy);
          }
        }
      }
      // Occasional tax tweaks in the player's nation go through congress.
      if (isPlayerNation && U.chance(0.02)) {
        const t = U.chance(0.5) ? 'incomeTax' : 'vat';
        const cur = n[t];
        const v = +U.clamp(cur + U.pick([-0.03, -0.02, 0.02, 0.03]), 0.02, t === 'vat' ? 0.25 : 0.4).toFixed(2);
        propose(t, null, v, false);
      } else if (!isPlayerNation && U.chance(0.02)) {
        n.incomeTax = +U.clamp(n.incomeTax + U.pick([-0.02, 0.02]), 0.03, 0.3).toFixed(2);
      }
    }
  }

  G.politics = {
    LAW_TEXT, joinParty, leaveParty, toggleCandidacy, daysUntil, playerScore,
    congressElection, presidentialElections, playerPropose, vote, resolveLaws, dailyNations, largestParty,
  };
})();
