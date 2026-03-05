import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, RotateCcw } from 'lucide-react';

// Hand evaluation constants
const RANKS = "23456789TJQKA";
const SUITS = "shdc";
const RANK_VALUE = {};
RANKS.split('').forEach((r, i) => RANK_VALUE[r] = i + 2);

// ============= HAND EVALUATION LOGIC =============
const isStraight = (values) => {
  const vals = [...new Set(values)].sort((a, b) => b - a);
  if (vals.includes(14)) vals.push(1); // Ace can be low
  
  for (let i = 0; i <= vals.length - 5; i++) {
    const window = vals.slice(i, i + 5);
    if (window[0] - window[4] === 4 && new Set(window).size === 5) {
      return window[0] === 1 ? 5 : window[0];
    }
  }
  return null;
};

const eval5Cards = (cards) => {
  const ranks = cards.map(c => RANK_VALUE[c.rank]);
  const suits = cards.map(c => c.suit);
  const ranksSorted = ranks.sort((a, b) => b - a);
  
  const counts = {};
  ranks.forEach(r => counts[r] = (counts[r] || 0) + 1);
  const countVals = Object.values(counts).sort((a, b) => b - a);
  const byCount = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });
  
  const isFlush = new Set(suits).size === 1;
  const straightHigh = isStraight(ranksSorted);
  
  // Straight Flush
  if (isFlush && straightHigh !== null) {
    return [8, straightHigh];
  }
  // Four of a Kind
  if (countVals[0] === 4) {
    const quad = parseInt(byCount[0][0]);
    const kicker = Math.max(...ranksSorted.filter(r => r !== quad));
    return [7, quad, kicker];
  }
  // Full House
  if (countVals[0] === 3 && countVals[1] === 2) {
    return [6, parseInt(byCount[0][0]), parseInt(byCount[1][0])];
  }
  // Flush
  if (isFlush) {
    return [5, ...ranksSorted];
  }
  // Straight
  if (straightHigh !== null) {
    return [4, straightHigh];
  }
  // Three of a Kind
  if (countVals[0] === 3) {
    const trips = parseInt(byCount[0][0]);
    const kickers = ranksSorted.filter(r => r !== trips).sort((a, b) => b - a);
    return [3, trips, ...kickers];
  }
  // Two Pair
  if (countVals[0] === 2 && countVals[1] === 2) {
    const p1 = parseInt(byCount[0][0]);
    const p2 = parseInt(byCount[1][0]);
    const [high, low] = [Math.max(p1, p2), Math.min(p1, p2)];
    const kicker = Math.max(...ranksSorted.filter(r => r !== p1 && r !== p2));
    return [2, high, low, kicker];
  }
  // One Pair
  if (countVals[0] === 2) {
    const pair = parseInt(byCount[0][0]);
    const kickers = ranksSorted.filter(r => r !== pair).sort((a, b) => b - a);
    return [1, pair, ...kickers];
  }
  // High Card
  return [0, ...ranksSorted];
};

const eval7Cards = (cards) => {
  let best = null;
  const combinations = [];
  
  // Generate all 5-card combinations from 7 cards
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      for (let k = j + 1; k < cards.length; k++) {
        for (let l = k + 1; l < cards.length; l++) {
          for (let m = l + 1; m < cards.length; m++) {
            combinations.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
          }
        }
      }
    }
  }
  
  for (const combo of combinations) {
    const val = eval5Cards(combo);
    if (!best || compareHands(val, best) > 0) {
      best = val;
    }
  }
  
  return best;
};

const compareHands = (hand1, hand2) => {
  for (let i = 0; i < Math.max(hand1.length, hand2.length); i++) {
    const v1 = hand1[i] || 0;
    const v2 = hand2[i] || 0;
    if (v1 > v2) return 1;
    if (v1 < v2) return -1;
  }
  return 0;
};

const handName = (category) => {
  const names = {
    8: "Straight Flush", 7: "Four of a Kind", 6: "Full House",
    5: "Flush", 4: "Straight", 3: "Three of a Kind",
    2: "Two Pair", 1: "One Pair", 0: "High Card"
  };
  return names[category] || "Unknown";
};

// ============= MONTE CARLO AI =============
const estimateWinRate = (myHole, community, aliveCount, deckRemaining, sims = 100) => {
  if (aliveCount <= 1) return 1.0;
  
  let wins = 0;
  let ties = 0;
  const needComm = 5 - community.length;
  
  for (let sim = 0; sim < sims; sim++) {
    const shuffled = [...deckRemaining].sort(() => Math.random() - 0.5);
    const commAdd = shuffled.slice(0, needComm);
    const oppCards = shuffled.slice(needComm, needComm + 2 * (aliveCount - 1));
    
    const finalComm = [...community, ...commAdd];
    const myVal = eval7Cards([...myHole, ...finalComm]);
    
    const oppVals = [];
    for (let i = 0; i < aliveCount - 1; i++) {
      const oppHole = oppCards.slice(i * 2, i * 2 + 2);
      oppVals.push(eval7Cards([...oppHole, ...finalComm]));
    }
    
    const bestOpp = oppVals.reduce((best, curr) => 
      compareHands(curr, best) > 0 ? curr : best, oppVals[0]);
    
    const cmp = compareHands(myVal, bestOpp);
    if (cmp > 0) wins++;
    else if (cmp === 0) ties++;
  }
  
  return (wins + 0.5 * ties) / sims;
};

// Evaluate hand strength (preflop) with style adjustments
const evaluateHandStrength = (hole, style) => {
  const r1 = RANK_VALUE[hole[0].rank];
  const r2 = RANK_VALUE[hole[1].rank];
  const suited = hole[0].suit === hole[1].suit;
  const high = Math.max(r1, r2);
  const low = Math.min(r1, r2);
  const gap = high - low;
  
  let strength = 'trash';
  
  // Pocket pairs
  if (r1 === r2) {
    if (r1 >= 14) strength = 'premium'; // AA
    else if (r1 >= 12) strength = 'strong'; // KK, QQ
    else if (r1 >= 9) strength = 'good'; // JJ, TT, 99
    else if (r1 >= 6) strength = 'medium'; // 88, 77, 66, 55
    else strength = 'weak'; // 44, 33, 22
  }
  // High cards
  else if (high >= 14) { // Ace
    if (low >= 12) strength = suited ? 'strong' : 'strong'; // AK, AQ
    else if (low >= 10) strength = suited ? 'good' : 'medium'; // AJ, AT
    else if (low >= 8) strength = suited ? 'medium' : 'weak'; // A9, A8
    else strength = suited ? 'weak' : 'trash';
  }
  else if (high >= 13) { // King
    if (low >= 11) strength = suited ? 'good' : 'medium'; // KQ, KJ
    else if (low >= 9) strength = suited ? 'medium' : 'weak'; // KT, K9
    else strength = suited ? 'weak' : 'trash';
  }
  else if (high >= 12) { // Queen
    if (low >= 10) strength = suited ? 'medium' : 'weak'; // QJ, QT
    else strength = suited ? 'weak' : 'trash';
  }
  // Suited connectors
  else if (suited && gap <= 1 && high >= 9) strength = 'medium'; // T9s, 98s
  else if (suited && gap <= 2 && high >= 10) strength = 'weak'; // JTs, T8s
  // Connected high cards
  else if (gap <= 1 && high >= 10) strength = 'weak'; // JT, T9
  
  // STYLE ADJUSTMENTS
  // Loose players upgrade marginal hands
  if (style.includes('Loose')) {
    if (strength === 'weak') strength = 'medium';
    else if (strength === 'trash' && (suited || gap <= 2)) strength = 'weak';
  }
  
  // Tight players downgrade marginal hands
  if (style.includes('Tight')) {
    if (strength === 'medium' && !suited && gap > 1) strength = 'weak';
    else if (strength === 'weak') strength = 'trash';
  }
  
  return strength;
};

const aiDecide = (player, toCall, pot, community, alivePlayers, deckRemaining, bigBlind, currentBet, minRaise) => {
  const aliveCount = alivePlayers.filter(p => p.in_hand && !p.is_all_in).length;
  
  if (aliveCount <= 1) {
    if (toCall > 0) return { action: 'call', amount: Math.min(toCall, player.stack) };
    return { action: 'check', amount: 0 };
  }
  
  const style = player.style || 'Tight Aggressive';
  const isAggressive = style.includes('Aggressive');
  const isPassive = style.includes('Passive');
  const isTight = style.includes('Tight');
  const isLoose = style.includes('Loose');
  
  const winrate = estimateWinRate(
    player.hole, community, 
    alivePlayers.filter(p => p.in_hand).length,
    deckRemaining,
    80
  );
  
  const street = community.length;
  
  // PREFLOP: Use hand strength evaluation
  if (street === 0) {
    const handStrength = evaluateHandStrength(player.hole, style);
    
    // Premium hands: Always raise
    if (handStrength === 'premium') {
      if (player.stack <= toCall) return { action: 'call', amount: player.stack };
      const baseSize = 1.5;
      const styleMultiplier = isAggressive ? 1.3 : 0.8;
      const desiredRaise = Math.floor(pot * (baseSize * styleMultiplier + Math.random() * 0.5));
      const totalAmount = toCall + Math.max(desiredRaise, minRaise);
      const amount = Math.min(player.stack, totalAmount);
      if (amount <= toCall) return { action: 'call', amount: player.stack };
      return { action: 'raise', amount };
    }
    
    // Strong hands
    if (handStrength === 'strong') {
      const raiseChance = isAggressive ? 0.98 : 0.85;
      if (Math.random() < raiseChance) {
        if (player.stack <= toCall) return { action: 'call', amount: player.stack };
        const baseSize = 1.2;
        const styleMultiplier = isAggressive ? 1.2 : 0.9;
        const desiredRaise = Math.floor(pot * (baseSize * styleMultiplier + Math.random() * 0.6));
        const totalAmount = toCall + Math.max(desiredRaise, minRaise);
        const amount = Math.min(player.stack, totalAmount);
        if (amount <= toCall) return { action: 'call', amount: player.stack };
        return { action: 'raise', amount };
      }
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    
    // Good hands
    if (handStrength === 'good') {
      const foldThreshold = isTight ? bigBlind * 4 : bigBlind * 6;
      if (toCall > foldThreshold && Math.random() < 0.4) {
        return { action: 'fold', amount: 0 };
      }
      
      const raiseChance = isAggressive ? 0.85 : 0.60;
      if (Math.random() < raiseChance) {
        if (player.stack <= toCall) return { action: 'call', amount: player.stack };
        const baseSize = 0.8;
        const styleMultiplier = isAggressive ? 1.3 : 0.9;
        const desiredRaise = Math.floor(pot * (baseSize * styleMultiplier + Math.random() * 0.7));
        const totalAmount = toCall + Math.max(desiredRaise, minRaise);
        const amount = Math.min(player.stack, totalAmount);
        if (amount <= toCall) return { action: 'call', amount: player.stack };
        return { action: 'raise', amount };
      }
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    
    // Medium hands
    if (handStrength === 'medium') {
      const foldThreshold = isTight ? bigBlind * 2 : bigBlind * 4;
      if (toCall > foldThreshold && Math.random() < 0.6) {
        return { action: 'fold', amount: 0 };
      }
      
      if (toCall === 0) {
        const raiseChance = isAggressive ? 0.6 : 0.3;
        if (Math.random() < raiseChance) {
          const desiredRaise = Math.floor(pot * 0.6);
          const totalAmount = Math.max(desiredRaise, minRaise);
          const amount = Math.min(player.stack, totalAmount);
          return { action: 'raise', amount };
        }
        return { action: 'check', amount: 0 };
      }
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    
    // Weak hands
    if (handStrength === 'weak') {
      if (toCall <= bigBlind && Math.random() < 0.4) {
        return { action: 'call', amount: Math.min(toCall, player.stack) };
      }
      return toCall === 0 ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
    }
    
    // Trash
    if (toCall === 0) return { action: 'check', amount: 0 };
    if (toCall <= bigBlind * 0.5 && isLoose && Math.random() < 0.3) {
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    return { action: 'fold', amount: 0 };
  }
  
  // POST-FLOP: Winrate-based with style adjustments
  let low = 0.12, high = 0.40;
  if (street >= 4) { low = 0.15; high = 0.45; }
  
  if (isTight) {
    low += 0.03;
    high += 0.05;
  }
  if (isLoose) {
    low -= 0.03;
    high -= 0.05;
  }
  
  const potCommitmentRatio = player.contributed / Math.max(player.stack + player.contributed, 1);
  const commitmentBonus = potCommitmentRatio * 0.15;
  low = Math.max(0.05, low - commitmentBonus);
  
  if (toCall > 0) {
    const betToPotRatio = toCall / Math.max(pot, 1);
    
    if (betToPotRatio > 0.5 && potCommitmentRatio < 0.3) {
      low += 0.05;
      high += 0.05;
    }
    
    const potOdds = toCall / Math.max(1, pot + toCall);
    const foldThreshold = 0.08 + commitmentBonus;
    if (winrate + foldThreshold < potOdds && toCall > bigBlind * 2) {
      return { action: 'fold', amount: 0 };
    }
  }
  
  if (winrate < low) {
    const callChance = 0.4 + potCommitmentRatio * 0.3;
    if (toCall > 0 && toCall <= bigBlind && Math.random() < callChance) {
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    
    if (potCommitmentRatio > 0.4 && toCall <= pot * 0.5 && Math.random() < 0.5) {
      return { action: 'call', amount: Math.min(toCall, player.stack) };
    }
    
    return toCall === 0 ? { action: 'check', amount: 0 } : { action: 'fold', amount: 0 };
  }
  
  if (winrate < high) {
    if (toCall === 0) {
      const betChance = isAggressive ? 0.6 : 0.3;
      if (Math.random() < betChance + potCommitmentRatio * 0.2) {
        const desiredBet = Math.floor(pot * (0.5 + Math.random() * 0.5));
        const amount = Math.min(player.stack, Math.max(desiredBet, minRaise));
        return { action: 'raise', amount };
      }
      return { action: 'check', amount: 0 };
    }
    return { action: 'call', amount: Math.min(toCall, player.stack) };
  }
  
  // Strong hands
  if (player.stack <= toCall) {
    return { action: 'call', amount: player.stack };
  }
  
  const strengthFactor = (winrate - high) / (1 - high);
  const baseMult = isAggressive ? 1.0 : 0.6;
  const desiredRaise = Math.floor(pot * (baseMult + 1.3 * strengthFactor));
  const totalAmount = toCall + Math.max(desiredRaise, minRaise);
  const amount = Math.min(player.stack, totalAmount);
  
  if (amount <= toCall) {
    return { action: 'call', amount: Math.min(toCall, player.stack) };
  }
  
  return { action: 'raise', amount };
};

// Card component
const Card = ({ rank, suit, faceDown = false }) => {
  const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
  const suitColors = { s: 'text-gray-800', h: 'text-red-600', d: 'text-red-600', c: 'text-gray-800' };
  
  if (faceDown) {
    return (
      <div className="w-14 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg border-2 border-blue-900 flex items-center justify-center shadow-lg">
        <div className="text-white text-2xl">🂠</div>
      </div>
    );
  }
  
  return (
    <div className="w-14 h-20 bg-white rounded-lg border-2 border-gray-300 shadow-md flex flex-col items-center justify-between p-1">
      <div className={`text-xl font-bold ${suitColors[suit]}`}>{rank}</div>
      <div className={`text-2xl ${suitColors[suit]}`}>{suitSymbols[suit]}</div>
      <div className={`text-xl font-bold ${suitColors[suit]} transform rotate-180`}>{rank}</div>
    </div>
  );
};

// Player component with circular positioning
const Player = ({ player, isDealer, isActive, position, totalPlayers, omniscientView }) => {
  const getCircularPosition = (index, total) => {
    // Position players in a circle around the pot
    const angle = (360 / total) * index - 90; // Start from top
    const radian = (angle * Math.PI) / 180;
    
    // Container is 1000x700, center the players around it
    const centerX = 500; // Half of 1000px container width
    const centerY = 350; // Half of 700px container height
    const radiusX = 320; // Horizontal distance from center
    const radiusY = 240; // Vertical distance from center
    
    const x = centerX + Math.cos(radian) * radiusX;
    const y = centerY + Math.sin(radian) * radiusY;
    
    return { x, y };
  };
  
  const pos = getCircularPosition(position, totalPlayers);
  
  // Show hole cards if: player's showHole is true OR omniscient view is enabled
  const shouldShowCards = player.showHole || omniscientView;
  
  return (
    <div 
      className="absolute transition-all duration-300"
      style={{
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className={`bg-gradient-to-br ${isActive ? 'from-yellow-400 to-yellow-600' : 'from-gray-700 to-gray-900'} rounded-lg p-3 shadow-xl ${!player.in_hand ? 'opacity-40' : ''} ${isActive ? 'ring-4 ring-yellow-300 scale-105' : ''} min-w-[140px]`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="text-white font-bold text-sm">{player.name}</div>
          {isDealer && <div className="bg-red-600 text-white text-xs px-2 py-1 rounded-full font-bold">D</div>}
        </div>
        {player.style && (
          <div className="text-xs text-gray-300 mb-1 truncate" title={player.style}>
            {player.style.split(' ').map(w => w[0]).join('')}
          </div>
        )}
        <div className="text-green-400 font-mono text-base">${player.stack}</div>
        {player.contributed > 0 && (
          <div className="text-yellow-300 text-xs mt-1">Bet: ${player.contributed}</div>
        )}
        {player.is_all_in && (
          <div className="text-red-400 text-xs font-bold mt-1">ALL IN</div>
        )}
        <div className="flex gap-1 mt-2 justify-center">
          {player.hole.map((card, i) => (
            <Card key={i} rank={card.rank} suit={card.suit} faceDown={!shouldShowCards} />
          ))}
        </div>
      </div>
    </div>
  );
};

// Main game component
const TexasHoldemGame = () => {
  const [gameState, setGameState] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);
  const [actionLog, setActionLog] = useState([]);
  const [omniscientView, setOmniscientView] = useState(false);
  const [autoContinue, setAutoContinue] = useState(false);
  const [humanPlayerEnabled, setHumanPlayerEnabled] = useState(false);
  const [waitingForHuman, setWaitingForHuman] = useState(false);
  
  useEffect(() => {
    initializeGame();
  }, []);
  
  const createDeck = () => {
    const deck = [];
    for (let r of RANKS) {
      for (let s of SUITS) {
        deck.push({ rank: r, suit: s });
      }
    }
    return deck.sort(() => Math.random() - 0.5);
  };
  
  const initializeGame = (withHuman = false) => {
    const styles = ['Tight Passive', 'Tight Aggressive', 'Loose Passive', 'Loose Aggressive'];
    const players = [];
    
    // Add 5 AI players (or 6 if no human)
    const aiCount = withHuman ? 5 : 6;
    for (let i = 0; i < aiCount; i++) {
      const style = styles[Math.floor(Math.random() * styles.length)];
      players.push({
        name: `AI_${i + 1}`,
        stack: 2000,
        hole: [],
        in_hand: true,
        contributed: 0,
        is_all_in: false,
        showHole: false,
        style: style,
        isHuman: false
      });
    }
    
    // Add human player in position 6 if enabled
    if (withHuman) {
      players.push({
        name: 'You',
        stack: 2000,
        hole: [],
        in_hand: true,
        contributed: 0,
        is_all_in: false,
        showHole: true,
        style: 'Human',
        isHuman: true
      });
    }
    
    setGameState({
      players,
      community: [],
      pot: 0,
      dealer: 0,
      currentPlayer: -1,
      stage: 'ready',
      handNumber: 0,
      deck: createDeck(),
      currentBet: 0,
      smallBlind: 10,
      bigBlind: 20,
      ante: 10,
      minRaise: 20
    });
    
    const styleLog = players.map(p => `${p.name}: ${p.style}`);
    setActionLog(['Game initialized. Click "Start Hand" to begin.', '=== Player Styles ===', ...styleLog]);
    setHumanPlayerEnabled(withHuman);
    setWaitingForHuman(false);
  };
  
  const startNewHand = () => {
    if (!gameState) return;
    
    // Move dealer button clockwise
    const newDealer = (gameState.dealer + 1) % gameState.players.length;
    
    const newDeck = createDeck();
    const players = gameState.players.map(p => ({
      ...p,
      hole: [],
      in_hand: p.stack > 0,
      contributed: 0,
      is_all_in: false,
      showHole: false
    }));
    
    // Collect antes from all players
    let pot = 0;
    const anteLog = [];
    players.forEach(p => {
      if (p.in_hand) {
        const ante = Math.min(gameState.ante, p.stack);
        p.stack -= ante;
        p.contributed = ante;
        pot += ante;
        if (p.stack === 0) p.is_all_in = true;
        if (ante > 0) anteLog.push(`${p.name} posts ante $${ante}`);
      }
    });
    
    // Deal hole cards
    for (let i = 0; i < 2; i++) {
      players.forEach(p => {
        if (p.in_hand) {
          p.hole.push(newDeck.pop());
        }
      });
    }
    
    // Post blinds (relative to NEW dealer position)
    const sbIdx = (newDealer + 1) % players.length;
    const bbIdx = (newDealer + 2) % players.length;
    
    const blindLog = [];
    if (players[sbIdx].in_hand && players[sbIdx].stack > 0) {
      const sb = Math.min(gameState.smallBlind, players[sbIdx].stack);
      players[sbIdx].stack -= sb;
      players[sbIdx].contributed += sb;
      pot += sb;
      if (players[sbIdx].stack === 0) players[sbIdx].is_all_in = true;
      blindLog.push(`${players[sbIdx].name} posts SB $${gameState.smallBlind}`);
    }
    
    if (players[bbIdx].in_hand && players[bbIdx].stack > 0) {
      const bb = Math.min(gameState.bigBlind, players[bbIdx].stack);
      players[bbIdx].stack -= bb;
      players[bbIdx].contributed += bb;
      pot += bb;
      if (players[bbIdx].stack === 0) players[bbIdx].is_all_in = true;
      blindLog.push(`${players[bbIdx].name} posts BB $${gameState.bigBlind}`);
    }
    
    setGameState({
      ...gameState,
      players,
      community: [],
      pot,
      stage: 'preflop',
      handNumber: gameState.handNumber + 1,
      deck: newDeck,
      currentBet: gameState.bigBlind,
      minRaise: gameState.bigBlind,
      currentPlayer: -1,
      dealer: newDealer
    });
    
    setActionLog([
      `Hand #${gameState.handNumber + 1} started`,
      `Dealer: ${players[newDealer].name}`,
      ...anteLog,
      ...blindLog,
      '--- Preflop ---'
    ]);
  };
  
  const executeNextAction = () => {
    if (!gameState || gameState.stage === 'complete' || gameState.stage === 'ready') return;
    
    const activePlayers = gameState.players.filter(p => p.in_hand && !p.is_all_in && p.stack > 0);
    
    if (activePlayers.length === 0) {
      advanceToShowdown();
      return;
    }
    
    if (gameState.players.filter(p => p.in_hand).length <= 1) {
      const winner = gameState.players.find(p => p.in_hand);
      winner.stack += gameState.pot;
      setActionLog(prev => [...prev, `${winner.name} wins $${gameState.pot} (everyone folded)`]);
      setGameState({ ...gameState, stage: 'complete', currentPlayer: -1 });
      setIsPlaying(false);
      setWaitingForHuman(false);
      return;
    }
    
    // Check if betting round is complete
    const allActed = activePlayers.every(p => {
      return p.contributed === gameState.currentBet || p.is_all_in;
    });
    
    if (allActed && gameState.currentPlayer !== -1) {
      advanceStage();
      return;
    }
    
    // Find next player to act
    let nextPlayer = (gameState.currentPlayer + 1) % gameState.players.length;
    let attempts = 0;
    
    while (attempts < gameState.players.length) {
      const p = gameState.players[nextPlayer];
      
      if (p.in_hand && !p.is_all_in && p.stack > 0) {
        break;
      }
      
      nextPlayer = (nextPlayer + 1) % gameState.players.length;
      attempts++;
    }
    
    if (attempts >= gameState.players.length) {
      advanceStage();
      return;
    }
    
    const player = gameState.players[nextPlayer];
    
    // If it's human player's turn, pause and wait
    if (player.isHuman) {
      setGameState({
        ...gameState,
        currentPlayer: nextPlayer
      });
      setWaitingForHuman(true);
      setIsPlaying(false);
      return;
    }
    
    // AI player logic
    const toCall = gameState.currentBet - player.contributed;
    
    const usedCards = new Set();
    gameState.community.forEach(c => usedCards.add(`${c.rank}${c.suit}`));
    gameState.players.forEach(p => p.hole.forEach(c => usedCards.add(`${c.rank}${c.suit}`)));
    const deckRemaining = gameState.deck.filter(c => !usedCards.has(`${c.rank}${c.suit}`));
    
    const decision = aiDecide(
      player, toCall, gameState.pot, gameState.community,
      gameState.players, deckRemaining, gameState.bigBlind, 
      gameState.currentBet, gameState.minRaise
    );
    
    executeAction(nextPlayer, decision);
  };
  
  const executeAction = (playerIndex, decision) => {
    const newPlayers = [...gameState.players];
    const p = newPlayers[playerIndex];
    let newPot = gameState.pot;
    let newBet = gameState.currentBet;
    let newMinRaise = gameState.minRaise;
    let logMsg = '';
    
    switch (decision.action) {
      case 'fold':
        p.in_hand = false;
        logMsg = `${p.name} folds`;
        break;
      case 'check':
        logMsg = `${p.name} checks`;
        break;
      case 'call':
        const callAmt = Math.min(decision.amount, p.stack);
        p.stack -= callAmt;
        p.contributed += callAmt;
        newPot += callAmt;
        if (p.stack === 0) p.is_all_in = true;
        logMsg = `${p.name} calls $${callAmt}`;
        break;
      case 'raise':
        const raiseAmt = Math.min(decision.amount, p.stack);
        p.stack -= raiseAmt;
        p.contributed += raiseAmt;
        newPot += raiseAmt;
        
        // Update minimum raise for next player
        const previousBet = newBet;
        newBet = p.contributed;
        const actualRaiseSize = newBet - previousBet;
        newMinRaise = actualRaiseSize; // Next raise must be at least this much
        
        if (p.stack === 0) p.is_all_in = true;
        logMsg = `${p.name} raises to $${p.contributed}`;
        break;
    }
    
    setGameState({
      ...gameState,
      players: newPlayers,
      pot: newPot,
      currentBet: newBet,
      minRaise: newMinRaise,
      currentPlayer: playerIndex
    });
    
    setActionLog(prev => [...prev.slice(-15), logMsg]);
    setWaitingForHuman(false);
  };
  
  const handleHumanAction = (action, raiseAmount = 0) => {
    if (!waitingForHuman || !gameState) return;
    
    const player = gameState.players[gameState.currentPlayer];
    const toCall = gameState.currentBet - player.contributed;
    
    let decision;
    switch (action) {
      case 'fold':
        decision = { action: 'fold', amount: 0 };
        break;
      case 'check':
        decision = { action: 'check', amount: 0 };
        break;
      case 'call':
        decision = { action: 'call', amount: toCall };
        break;
      case 'raise':
        decision = { action: 'raise', amount: raiseAmount };
        break;
      default:
        return;
    }
    
    executeAction(gameState.currentPlayer, decision);
    
    // Resume auto-play if it was on
    if (autoContinue) {
      setTimeout(() => setIsPlaying(true), 500);
    }
  };
  
  const advanceStage = () => {
    if (!gameState) return;
    
    let newStage = gameState.stage;
    let newCommunity = [...gameState.community];
    let logMsg = '';
    
    // Reset contributions for new betting round
    const newPlayers = gameState.players.map(p => ({ ...p, contributed: 0 }));
    
    switch (gameState.stage) {
      case 'preflop':
        newStage = 'flop';
        newCommunity = [gameState.deck.pop(), gameState.deck.pop(), gameState.deck.pop()];
        logMsg = '--- Flop ---';
        break;
      case 'flop':
        newStage = 'turn';
        newCommunity.push(gameState.deck.pop());
        logMsg = '--- Turn ---';
        break;
      case 'turn':
        newStage = 'river';
        newCommunity.push(gameState.deck.pop());
        logMsg = '--- River ---';
        break;
      case 'river':
        advanceToShowdown();
        return;
    }
    
    setGameState({
      ...gameState,
      players: newPlayers,
      stage: newStage,
      community: newCommunity,
      currentBet: 0,
      minRaise: gameState.bigBlind, // Reset to BB for new betting round
      currentPlayer: gameState.dealer
    });
    
    setActionLog(prev => [...prev, logMsg]);
  };
  
  const advanceToShowdown = () => {
    const newPlayers = gameState.players.map(p => ({
      ...p,
      showHole: p.in_hand
    }));
    
    const alive = newPlayers.filter(p => p.in_hand);
    
    if (alive.length === 1) {
      alive[0].stack += gameState.pot;
      setActionLog(prev => [...prev, '--- Showdown ---', `${alive[0].name} wins $${gameState.pot}!`]);
    } else {
      const hands = alive.map(p => ({
        player: p,
        value: eval7Cards([...p.hole, ...gameState.community])
      }));
      
      hands.sort((a, b) => compareHands(b.value, a.value));
      const bestValue = hands[0].value;
      const winners = hands.filter(h => compareHands(h.value, bestValue) === 0).map(h => h.player);
      
      const share = Math.floor(gameState.pot / winners.length);
      winners.forEach(w => w.stack += share);
      
      const logs = ['--- Showdown ---'];
      alive.forEach(p => {
        const val = eval7Cards([...p.hole, ...gameState.community]);
        logs.push(`${p.name}: ${handName(val[0])}`);
      });
      logs.push(`${winners.map(w => w.name).join(', ')} win${winners.length > 1 ? '' : 's'} $${share}!`);
      setActionLog(prev => [...prev, ...logs]);
    }
    
    setGameState({
      ...gameState,
      players: newPlayers,
      stage: 'complete',
      currentPlayer: -1
    });
    
    setIsPlaying(false);
  };
  
  useEffect(() => {
    if (!isPlaying || !gameState || gameState.stage === 'complete' || gameState.stage === 'ready') {
      return;
    }
    
    const timer = setTimeout(() => {
      executeNextAction();
    }, speed);
    
    return () => clearTimeout(timer);
  }, [isPlaying, gameState, speed]);
  
  // Auto-continue to next hand
  useEffect(() => {
    if (!autoContinue || !gameState || gameState.stage !== 'complete') {
      return;
    }
    
    // Wait 2 seconds before starting next hand
    const timer = setTimeout(() => {
      const activePlayers = gameState.players.filter(p => p.stack > 0);
      if (activePlayers.length > 1) {
        startNewHand();
        setIsPlaying(true); // Auto-start playing
      }
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [autoContinue, gameState]);
  
  if (!gameState) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }
  
  return (
    <div className="w-full h-screen bg-gradient-to-br from-green-800 to-green-900 overflow-hidden">
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Poker table - centered container */}
        <div className="relative" style={{ width: '1000px', height: '700px' }}>
          {/* Table surface */}
          <div className="absolute inset-[50px] bg-green-700 rounded-full border-[12px] border-amber-900 shadow-2xl">
            {/* Empty table - cards and pot moved to control panel */}
          </div>
          
          {/* Players - positioned around the container */}
          {gameState.players.map((player, i) => (
            <Player
              key={i}
              player={player}
              isDealer={i === gameState.dealer}
              isActive={i === gameState.currentPlayer}
              position={i}
              totalPlayers={gameState.players.length}
              omniscientView={omniscientView}
            />
          ))}
        </div>
        
        {/* Control panel */}
        <div className="absolute top-4 left-4 bg-gray-900 bg-opacity-95 rounded-lg p-4 shadow-xl max-w-xs">
          <h2 className="text-white text-xl font-bold mb-3">Texas Hold'em AI</h2>
          <div className="text-green-400 mb-2">Hand #{gameState.handNumber}</div>
          <div className="text-yellow-400 mb-4 capitalize">Stage: {gameState.stage}</div>
          
          {/* Human Player Toggle - only show before game starts */}
          {gameState.stage === 'ready' && (
            <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-green-500">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanPlayerEnabled}
                  onChange={(e) => initializeGame(e.target.checked)}
                  className="w-5 h-5 cursor-pointer"
                />
                <div>
                  <div className="text-green-400 font-bold text-sm">🎮 Play as Human</div>
                  <div className="text-gray-400 text-xs">Join the game (replaces AI_6)</div>
                </div>
              </label>
            </div>
          )}
          
          {/* Human Action Buttons */}
          {waitingForHuman && gameState.currentPlayer >= 0 && (
            <div className="mb-4 p-3 bg-yellow-900 rounded-lg border-2 border-yellow-500">
              <div className="text-yellow-300 font-bold text-sm mb-3">Your Turn!</div>
              {(() => {
                const player = gameState.players[gameState.currentPlayer];
                const toCall = gameState.currentBet - player.contributed;
                const minRaiseTotal = toCall + gameState.minRaise;
                const canCheck = toCall === 0;
                
                return (
                  <div className="space-y-2">
                    <div className="text-white text-xs mb-2">
                      To call: ${toCall} | Your stack: ${player.stack}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleHumanAction('fold')}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded text-sm font-bold"
                      >
                        Fold
                      </button>
                      {canCheck ? (
                        <button
                          onClick={() => handleHumanAction('check')}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded text-sm font-bold"
                        >
                          Check
                        </button>
                      ) : (
                        <button
                          onClick={() => handleHumanAction('call')}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded text-sm font-bold"
                        >
                          Call ${toCall}
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number"
                        id="raiseAmount"
                        min={minRaiseTotal}
                        max={player.stack}
                        defaultValue={minRaiseTotal}
                        className="flex-1 bg-gray-700 text-white px-2 py-2 rounded text-sm"
                      />
                      <button
                        onClick={() => {
                          const amount = parseInt(document.getElementById('raiseAmount').value) || minRaiseTotal;
                          handleHumanAction('raise', Math.min(Math.max(amount, minRaiseTotal), player.stack));
                        }}
                        className="flex-1 bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded text-sm font-bold"
                      >
                        Raise
                      </button>
                    </div>
                    <div className="text-gray-400 text-xs">Min raise: ${minRaiseTotal}</div>
                  </div>
                );
              })()}
            </div>
          )}
          
          {/* Omniscient View Toggle */}
          <div className="mb-3 p-3 bg-gray-800 rounded-lg border border-purple-500">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={omniscientView}
                onChange={(e) => setOmniscientView(e.target.checked)}
                className="w-5 h-5 cursor-pointer"
              />
              <div>
                <div className="text-purple-400 font-bold text-sm">👁️ 전지적 관리자 시점</div>
                <div className="text-gray-400 text-xs">모든 AI 카드 보기</div>
              </div>
            </label>
          </div>
          
          {/* Auto-Continue Toggle */}
          <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-blue-500">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={autoContinue}
                onChange={(e) => setAutoContinue(e.target.checked)}
                className="w-5 h-5 cursor-pointer"
              />
              <div>
                <div className="text-blue-400 font-bold text-sm">🔄 자동 연속 플레이</div>
                <div className="text-gray-400 text-xs">핸드 종료 후 자동 시작</div>
              </div>
            </label>
          </div>
          
          <div className="flex gap-2 mb-4">
            {gameState.stage === 'ready' || gameState.stage === 'complete' ? (
              <button
                onClick={startNewHand}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition"
              >
                <Play size={16} />
                Start Hand
              </button>
            ) : (
              <>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className={`flex-1 ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition`}
                >
                  {isPlaying ? <><Pause size={16} /> Pause</> : <><Play size={16} /> Play</>}
                </button>
                <button
                  onClick={executeNextAction}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
                  disabled={isPlaying}
                >
                  <SkipForward size={16} />
                </button>
              </>
            )}
            <button
              onClick={initializeGame}
              className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          
          <div className="mb-3">
            <label className="text-white text-sm mb-1 block">Speed: {speed}ms</label>
            <input
              type="range"
              min="200"
              max="2000"
              step="100"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              className="w-full"
            />
          </div>
          
          {/* Pot Display */}
          <div className="mb-3 bg-yellow-500 text-gray-900 px-4 py-2 rounded-lg font-bold text-center text-lg shadow-lg">
            Pot: ${gameState.pot}
          </div>
          
          {/* Community Cards Display */}
          <div className="mb-3 bg-gray-800 rounded-lg p-3">
            <div className="text-white text-sm font-bold mb-2">Community Cards</div>
            <div className="flex gap-2 justify-center flex-wrap">
              {gameState.community.length > 0 ? (
                gameState.community.map((card, i) => (
                  <Card key={i} rank={card.rank} suit={card.suit} />
                ))
              ) : (
                <div className="text-gray-500 text-sm py-2">No cards yet</div>
              )}
            </div>
          </div>
          
          <div className="bg-gray-800 rounded p-2 max-h-60 overflow-y-auto">
            <div className="text-white text-xs font-mono space-y-1">
              {actionLog.map((log, i) => (
                <div key={i} className={`py-0.5 ${log.startsWith('---') ? 'text-yellow-400 font-bold' : ''}`}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TexasHoldemGame;