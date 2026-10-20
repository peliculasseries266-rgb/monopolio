'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;

/* ------------------------------------------------------------------ */
/*  TABLERO                                                            */
/* ------------------------------------------------------------------ */
const GROUPS = {
  brown:  { c: '#8d5a3b', h: 50 },
  lb:     { c: '#8fd3f4', h: 50 },
  pink:   { c: '#e86fb0', h: 100 },
  orange: { c: '#f5953b', h: 100 },
  red:    { c: '#e04646', h: 150 },
  yellow: { c: '#f2d21b', h: 150 },
  green:  { c: '#2fa35c', h: 200 },
  blue:   { c: '#2f5bd1', h: 200 },
};
const pr = (n, g, price, rent) => ({ t: 'prop', n, g, price, rent });
const BOARD = [
  { t: 'go', n: 'SALIDA' },
  pr('Tijuana', 'brown', 60, [2, 10, 30, 90, 160, 250]),
  { t: 'chest', n: 'Caja comunal' },
  pr('Mexicali', 'brown', 60, [4, 20, 60, 180, 320, 450]),
  { t: 'tax', n: 'Impuesto sobre la renta', amt: 200 },
  { t: 'rail', n: 'Aeropuerto Norte', price: 200 },
  pr('Mazatlán', 'lb', 100, [6, 30, 90, 270, 400, 550]),
  { t: 'chance', n: 'Suerte' },
  pr('La Paz', 'lb', 100, [6, 30, 90, 270, 400, 550]),
  pr('Los Cabos', 'lb', 120, [8, 40, 100, 300, 450, 600]),
  { t: 'jail', n: 'Cárcel / Visita' },
  pr('Mérida', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  { t: 'util', n: 'Compañía de Luz', price: 150 },
  pr('Campeche', 'pink', 140, [10, 50, 150, 450, 625, 750]),
  pr('Cancún', 'pink', 160, [12, 60, 180, 500, 700, 900]),
  { t: 'rail', n: 'Aeropuerto Sur', price: 200 },
  pr('Oaxaca', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  { t: 'chest', n: 'Caja comunal' },
  pr('Puebla', 'orange', 180, [14, 70, 200, 550, 750, 950]),
  pr('Cuernavaca', 'orange', 200, [16, 80, 220, 600, 800, 1000]),
  { t: 'free', n: 'Estacionamiento libre' },
  pr('Guadalajara', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  { t: 'chance', n: 'Suerte' },
  pr('Morelia', 'red', 220, [18, 90, 250, 700, 875, 1050]),
  pr('Querétaro', 'red', 240, [20, 100, 300, 750, 925, 1100]),
  { t: 'rail', n: 'Aeropuerto Oriente', price: 200 },
  pr('Monterrey', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  pr('Veracruz', 'yellow', 260, [22, 110, 330, 800, 975, 1150]),
  { t: 'util', n: 'Agua Potable', price: 150 },
  pr('Tampico', 'yellow', 280, [24, 120, 360, 850, 1025, 1200]),
  { t: 'gojail', n: 'Ve a la cárcel' },
  pr('Guanajuato', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  pr('San Miguel', 'green', 300, [26, 130, 390, 900, 1100, 1275]),
  { t: 'chest', n: 'Caja comunal' },
  pr('Zacatecas', 'green', 320, [28, 150, 450, 1000, 1200, 1400]),
  { t: 'rail', n: 'Aeropuerto Poniente', price: 200 },
  { t: 'chance', n: 'Suerte' },
  pr('CDMX Centro', 'blue', 350, [35, 175, 500, 1100, 1300, 1500]),
  { t: 'tax', n: 'Impuesto de lujo', amt: 100 },
  pr('CDMX Polanco', 'blue', 400, [50, 200, 600, 1400, 1700, 2000]),
];
const groupIdx = (g) => BOARD.map((s, i) => (s.g === g ? i : -1)).filter((i) => i >= 0);
const isOwnable = (i) => ['prop', 'rail', 'util'].includes(BOARD[i].t);

/* ------------------------------------------------------------------ */
/*  CARTAS                                                             */
/* ------------------------------------------------------------------ */
const JAILCARD = { x: 'Sal de la cárcel gratis. Conserva esta carta hasta que la necesites.', t: 'jailcard' };
const CHANCE = [
  { x: 'Avanza a la Salida y cobra $200.', t: 'goto', to: 0 },
  { x: 'Viaje a Cancún. Avanza hasta Cancún.', t: 'goto', to: 14 },
  { x: 'Avanza a CDMX Polanco.', t: 'goto', to: 39 },
  { x: 'Avanza a Guadalajara. Si pasas por la Salida, cobra $200.', t: 'goto', to: 21 },
  { x: 'Avanza al Aeropuerto Sur.', t: 'goto', to: 15 },
  { x: 'Retrocede 3 casillas.', t: 'back', n: 3 },
  { x: 'Ve directo a la cárcel. No pases por la Salida.', t: 'jail' },
  JAILCARD,
  { x: 'El banco te paga dividendos de $50.', t: 'money', v: 50 },
  { x: 'Ganaste un concurso de cocina. Cobra $100.', t: 'money', v: 100 },
  { x: 'Multa por exceso de velocidad. Paga $15.', t: 'money', v: -15 },
  { x: 'Tu préstamo vence. Paga $150.', t: 'money', v: -150 },
  { x: 'Eres el anfitrión de la cena. Paga $50 a cada jugador.', t: 'each', v: -50 },
  { x: 'Reparaciones en tus propiedades: $25 por casa y $100 por hotel.', t: 'repairs', h: 25, H: 100 },
];
const CHEST = [
  { x: 'Error del banco a tu favor. Cobra $200.', t: 'money', v: 200 },
  { x: 'Herencia de un tío lejano. Cobra $100.', t: 'money', v: 100 },
  { x: 'Vendes boletos de rifa. Cobra $50.', t: 'money', v: 50 },
  { x: 'Devolución de impuestos. Cobra $20.', t: 'money', v: 20 },
  { x: 'Honorarios del doctor. Paga $50.', t: 'money', v: -50 },
  { x: 'Gastos del hospital. Paga $100.', t: 'money', v: -100 },
  { x: 'Colegiatura. Paga $150.', t: 'money', v: -150 },
  { x: 'Es tu cumpleaños. Cada jugador te da $10.', t: 'each', v: 10 },
  { x: 'Ve directo a la cárcel. No pases por la Salida.', t: 'jail' },
  { x: 'Avanza a la Salida y cobra $200.', t: 'goto', to: 0 },
  { x: 'Retrocede hasta Tijuana.', t: 'goto', to: 1 },
  { x: 'Reparaciones de calles: $40 por casa y $115 por hotel.', t: 'repairs', h: 40, H: 115 },
];
const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/* ------------------------------------------------------------------ */
/*  ESTADO                                                             */
/* ------------------------------------------------------------------ */
const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22'];
const EMOJIS = ['🚗', '🎩', '🐕', '🚢', '👢', '✈️'];
const START_MONEY = 1500;
const JAIL_FEE = 50;

let S;
function freshProps() {
  const o = {};
  BOARD.forEach((s, i) => {
    if (isOwnable(i)) o[i] = { owner: null, houses: 0, mortgaged: false };
  });
  return o;
}
function newGame(players) {
  S = {
    phase: 'lobby',
    players: players || [],
    props: freshProps(),
    turn: 0,
    rolled: false,
    dice: [1, 1],
    rollN: 0,
    dbl: 0,
    pending: null,
    log: [],
    card: null,
    winner: null,
    trade: null,
    seq: 0,
    decks: { chance: [], chest: [] },
  };
  S.players.forEach((p) => resetPlayer(p));
}
function resetPlayer(p) {
  p.money = START_MONEY;
  p.pos = 0;
  p.inJail = false;
  p.jailTurns = 0;
  p.jailCards = 0;
  p.bankrupt = false;
}
newGame();

const byId = (id) => S.players.find((p) => p.id === id);
const cur = () => S.players[S.turn];
const active = () => S.players.filter((p) => !p.bankrupt);
const ownedBy = (p) => Object.keys(S.props).map(Number).filter((i) => S.props[i].owner === p.id);
const $ = (n) => '$' + n;
function log(t) {
  S.log.push(t);
  if (S.log.length > 80) S.log.shift();
}

/* ------------------------------------------------------------------ */
/*  DINERO / BANCO                                                     */
/* ------------------------------------------------------------------ */
// Cobra al jugador. to = id de jugador | 'bank' | 'each'. Si no le alcanza, queda una deuda pendiente.
function charge(p, amount, to, reason, then) {
  const others = active().filter((q) => q !== p);
  const total = to === 'each' ? amount * others.length : amount;
  if (total <= 0) return true;
  if (p.money >= total) {
    settle(p, total, to, amount, reason);
    return true;
  }
  S.pending = { type: 'debt', pid: p.id, amount: total, unit: amount, to, reason, then: then || null };
  log(`${p.name} debe ${$(total)} (${reason}) y no le alcanza: debe vender o hipotecar.`);
  return false;
}
function settle(p, total, to, unit, reason) {
  p.money -= total;
  if (to === 'bank') {
    log(`${p.name} paga ${$(total)} al banco (${reason}).`);
  } else if (to === 'each') {
    active().filter((q) => q !== p).forEach((q) => (q.money += unit));
    log(`${p.name} paga ${$(unit)} a cada jugador (${reason}).`);
  } else {
    const q = byId(to);
    q.money += total;
    log(`${p.name} paga ${$(total)} a ${q.name} (${reason}).`);
  }
}

/* ------------------------------------------------------------------ */
/*  MOVIMIENTO Y CASILLAS                                              */
/* ------------------------------------------------------------------ */
function calcRent(i) {
  const sq = BOARD[i];
  const st = S.props[i];
  const o = st.owner;
  if (sq.t === 'rail') {
    const n = Object.keys(S.props).filter((j) => BOARD[j].t === 'rail' && S.props[j].owner === o).length;
    return 25 * 2 ** (n - 1);
  }
  if (sq.t === 'util') {
    const n = Object.keys(S.props).filter((j) => BOARD[j].t === 'util' && S.props[j].owner === o).length;
    return (S.dice[0] + S.dice[1]) * (n === 2 ? 10 : 4);
  }
  if (st.houses > 0) return sq.rent[st.houses];
  const full = groupIdx(sq.g).every((j) => S.props[j].owner === o);
  return full ? sq.rent[0] * 2 : sq.rent[0];
}
function sendJail(p) {
  p.pos = 10;
  p.inJail = true;
  p.jailTurns = 0;
  S.rolled = true;
  S.dbl = 0;
  log(`${p.name} va a la cárcel.`);
}
function move(p, steps) {
  const np = p.pos + steps;
  if (np >= 40) {
    p.money += 200;
    log(`${p.name} pasa por la Salida y cobra $200.`);
  }
  p.pos = np % 40;
  land(p);
}
function goTo(p, to) {
  if (to < p.pos) {
    p.money += 200;
    log(`${p.name} pasa por la Salida y cobra $200.`);
  }
  p.pos = to;
  land(p);
}
function land(p) {
  const sq = BOARD[p.pos];
  log(`${p.name} cae en ${sq.n}.`);
  switch (sq.t) {
    case 'prop':
    case 'rail':
    case 'util': {
      const st = S.props[p.pos];
      if (!st.owner) {
        if (p.money >= sq.price) S.pending = { type: 'buy', pid: p.id, idx: p.pos };
        else log(`${p.name} no tiene dinero para comprar ${sq.n} (${$(sq.price)}).`);
      } else if (st.owner !== p.id && !st.mortgaged) {
        charge(p, calcRent(p.pos), st.owner, 'renta de ' + sq.n);
      }
      break;
    }
    case 'tax':
      charge(p, sq.amt, 'bank', sq.n);
      break;
    case 'gojail':
      sendJail(p);
      break;
    case 'chance':
      draw(p, 'chance');
      break;
    case 'chest':
      draw(p, 'chest');
      break;
  }
}
function draw(p, deck) {
  if (!S.decks[deck].length) S.decks[deck] = shuffle(deck === 'chance' ? CHANCE : CHEST);
  const d = S.decks[deck];
  const c = d.shift();
  if (c.t !== 'jailcard') d.push(c);
  S.card = { deck, text: c.x, pid: p.id, n: ++S.seq };
  log(`${p.name} saca una carta de ${deck === 'chance' ? 'Suerte' : 'Caja comunal'}.`);
  switch (c.t) {
    case 'goto':
      goTo(p, c.to);
      break;
    case 'back':
      p.pos = (p.pos + 40 - c.n) % 40;
      land(p);
      break;
    case 'jail':
      sendJail(p);
      break;
    case 'jailcard':
      p.jailCards++;
      break;
    case 'money':
      if (c.v > 0) {
        p.money += c.v;
        log(`${p.name} cobra ${$(c.v)} del banco.`);
      } else charge(p, -c.v, 'bank', 'carta');
      break;
    case 'each':
      if (c.v > 0) {
        active().filter((q) => q !== p).forEach((q) => {
          const x = Math.min(q.money, c.v);
          q.money -= x;
          p.money += x;
        });
        log(`${p.name} cobra hasta ${$(c.v)} a cada jugador.`);
      } else charge(p, -c.v, 'each', 'carta');
      break;
    case 'repairs': {
      let h = 0, H = 0;
      ownedBy(p).forEach((i) => (S.props[i].houses === 5 ? H++ : (h += S.props[i].houses)));
      const tot = h * c.h + H * c.H;
      if (tot > 0) charge(p, tot, 'bank', 'reparaciones');
      else log(`${p.name} no tiene construcciones que reparar.`);
      break;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  TURNOS                                                             */
/* ------------------------------------------------------------------ */
const rd = () => 1 + Math.floor(Math.random() * 6);
function doRoll(p) {
  const a = rd(), b = rd();
  S.dice = [a, b];
  S.rollN++;
  S.card = null;
  const dbl = a === b;
  log(`${p.name} tira los dados: ${a} y ${b}.`);
  if (p.inJail) {
    if (dbl) {
      p.inJail = false;
      p.jailTurns = 0;
      S.rolled = true;
      log(`${p.name} sacó dobles y sale de la cárcel.`);
      move(p, a + b);
    } else {
      p.jailTurns++;
      S.rolled = true;
      if (p.jailTurns >= 3) {
        p.inJail = false;
        p.jailTurns = 0;
        log(`${p.name} cumple 3 turnos en la cárcel y debe pagar la fianza.`);
        if (charge(p, JAIL_FEE, 'bank', 'fianza', { move: a + b })) move(p, a + b);
      } else {
        log(`${p.name} no sacó dobles y sigue en la cárcel.`);
      }
    }
    return;
  }
  S.dbl = dbl ? S.dbl + 1 : 0;
  if (dbl && S.dbl === 3) {
    log(`${p.name} sacó 3 dobles seguidos.`);
    sendJail(p);
    return;
  }
  S.rolled = !dbl;
  if (dbl) log(`¡Dobles! ${p.name} vuelve a tirar.`);
  move(p, a + b);
}
function nextTurn() {
  let i = S.turn;
  do {
    i = (i + 1) % S.players.length;
  } while (S.players[i].bankrupt);
  S.turn = i;
  S.rolled = false;
  S.dbl = 0;
  S.pending = null;
  S.card = null;
}
function bankrupt(p, creditor) {
  const owned = ownedBy(p);
  if (creditor) {
    creditor.money += Math.max(0, p.money);
    creditor.jailCards += p.jailCards;
    owned.forEach((i) => {
      S.props[i].owner = creditor.id;
      S.props[i].houses = 0;
    });
    log(`${p.name} se declara en bancarrota. Sus propiedades pasan a ${creditor.name}.`);
  } else {
    owned.forEach((i) => (S.props[i] = { owner: null, houses: 0, mortgaged: false }));
    for (let k = 0; k < p.jailCards; k++) S.decks.chance.push(JAILCARD);
    log(`${p.name} sale de la partida. Sus propiedades vuelven al banco.`);
  }
  p.money = 0;
  p.jailCards = 0;
  p.bankrupt = true;
  p.inJail = false;
  if (S.pending && S.pending.pid === p.id) S.pending = null;
  if (S.trade && (S.trade.from === p.id || S.trade.to === p.id)) S.trade = null;
  if (active().length <= 1) {
    S.phase = 'ended';
    S.winner = active()[0] ? active()[0].id : null;
    S.pending = null;
    if (S.winner) log(`¡${byId(S.winner).name} gana la partida!`);
    return;
  }
  if (cur() === p) nextTurn();
}

/* ------------------------------------------------------------------ */
/*  CONSTRUIR / HIPOTECAR                                              */
/* ------------------------------------------------------------------ */
function buildErr(p, i) {
  const sq = BOARD[i], st = S.props[i];
  if (!st || sq.t !== 'prop' || st.owner !== p.id) return 'Esa propiedad no es tuya.';
  const grp = groupIdx(sq.g);
  if (!grp.every((j) => S.props[j].owner === p.id)) return 'Necesitas todas las propiedades del color.';
  if (grp.some((j) => S.props[j].mortgaged)) return 'Hay propiedades hipotecadas en ese color.';
  if (st.houses >= 5) return 'Ya tiene hotel.';
  if (grp.some((j) => S.props[j].houses < st.houses)) return 'Construye parejo: primero las otras del color.';
  if (p.money < GROUPS[sq.g].h) return 'No te alcanza el dinero.';
  return null;
}
function sellErr(p, i) {
  const sq = BOARD[i], st = S.props[i];
  if (!st || sq.t !== 'prop' || st.owner !== p.id) return 'Esa propiedad no es tuya.';
  if (st.houses <= 0) return 'No tiene casas.';
  if (groupIdx(sq.g).some((j) => S.props[j].houses > st.houses)) return 'Vende parejo: primero de la que tenga más.';
  return null;
}
function mortgageErr(p, i) {
  const sq = BOARD[i], st = S.props[i];
  if (!st || st.owner !== p.id) return 'Esa propiedad no es tuya.';
  if (st.mortgaged) return 'Ya está hipotecada.';
  if (sq.t === 'prop' && groupIdx(sq.g).some((j) => S.props[j].houses > 0)) return 'Vende primero las casas del color.';
  return null;
}

/* ------------------------------------------------------------------ */
/*  TRATOS                                                             */
/* ------------------------------------------------------------------ */
const num = (x) => Math.max(0, Math.floor(Number(x) || 0));
function tradeErr(t) {
  const a = byId(t.from), b = byId(t.to);
  if (!a || !b || a === b || a.bankrupt || b.bankrupt) return 'Jugador inválido.';
  for (const i of t.give.props) if (!S.props[i] || S.props[i].owner !== a.id) return 'Una propiedad ofrecida no es tuya.';
  for (const i of t.get.props) if (!S.props[i] || S.props[i].owner !== b.id) return 'Una propiedad pedida ya no es de ese jugador.';
  for (const i of [...t.give.props, ...t.get.props]) {
    if (BOARD[i].t === 'prop' && groupIdx(BOARD[i].g).some((j) => S.props[j].houses > 0)) return 'No se pueden tratar propiedades de un color con casas.';
  }
  if (t.give.money > a.money) return a.name + ' no tiene ese dinero.';
  if (t.get.money > b.money) return b.name + ' no tiene ese dinero.';
  if (!t.give.props.length && !t.get.props.length && !t.give.money && !t.get.money) return 'El trato está vacío.';
  return null;
}
function applyTrade(t) {
  const a = byId(t.from), b = byId(t.to);
  t.give.props.forEach((i) => (S.props[i].owner = b.id));
  t.get.props.forEach((i) => (S.props[i].owner = a.id));
  a.money += t.get.money - t.give.money;
  b.money += t.give.money - t.get.money;
  log(`Trato cerrado entre ${a.name} y ${b.name}.`);
}

/* ------------------------------------------------------------------ */
/*  ACCIONES DE LOS JUGADORES                                          */
/* ------------------------------------------------------------------ */
function sanitizeName(n) {
  return String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 12);
}
function isHost(p) {
  return p === S.players.find((q) => !q.bankrupt);
}
function handle(ws, m, reply) {
  const a = m.a;
  if (a === 'tv') {
    ws.tv = true;
    return;
  }
  if (a === 'hello' || a === 'join') {
    const token = String(m.token || '');
    let p = token && S.players.find((q) => q.token === token);
    if (!p && a === 'join') {
      if (S.phase !== 'lobby') return reply('La partida ya empezó.');
      if (S.players.length >= 6) return reply('La mesa está llena (máximo 6).');
      const name = sanitizeName(m.name);
      if (!name) return reply('Escribe tu nombre.');
      if (token.length < 8) return reply('Token inválido.');
      const used = S.players.map((q) => q.idx);
      let idx = 0;
      while (used.includes(idx)) idx++;
      p = { id: 'p' + Math.random().toString(36).slice(2, 8), token, name, idx, color: COLORS[idx], emoji: EMOJIS[idx] };
      resetPlayer(p);
      S.players.push(p);
      log(`${p.name} se unió a la mesa.`);
    }
    if (p) ws.pid = p.id;
    return;
  }

  const p = byId(ws.pid);
  if (!p) return reply('No estás en la partida.');
  const playing = S.phase === 'playing' && !p.bankrupt;
  const myTurn = playing && cur() === p;
  const i = Number(m.i);

  switch (a) {
    case 'start':
      if (!isHost(p)) return reply('Solo el anfitrión puede iniciar.');
      if (S.phase !== 'lobby') return;
      if (S.players.length < 2) return reply('Se necesitan al menos 2 jugadores.');
      S.phase = 'playing';
      S.decks = { chance: shuffle(CHANCE), chest: shuffle(CHEST) };
      S.turn = Math.floor(Math.random() * S.players.length);
      S.rolled = false;
      S.log = [];
      log(`¡Empieza la partida! Comienza ${cur().name}.`);
      break;

    case 'reset': {
      if (!isHost(p)) return reply('Solo el anfitrión puede reiniciar.');
      const keep = S.players;
      newGame(keep);
      break;
    }

    case 'kick': {
      if (!isHost(p)) return reply('Solo el anfitrión puede sacar jugadores.');
      const q = byId(m.id);
      if (!q || q === p) return;
      if (S.phase === 'lobby') {
        S.players = S.players.filter((x) => x !== q);
        for (const c of wss.clients) if (c.pid === q.id) c.pid = null;
      } else if (S.phase === 'playing' && !q.bankrupt) {
        bankrupt(q, null);
      }
      break;
    }

    case 'roll':
      if (!myTurn) return reply('No es tu turno.');
      if (S.pending) return reply('Resuelve primero lo pendiente.');
      if (S.rolled) return reply('Ya tiraste.');
      doRoll(p);
      break;

    case 'buy': {
      if (!myTurn || !S.pending || S.pending.type !== 'buy') return reply('No hay nada que comprar.');
      const sq = BOARD[S.pending.idx];
      if (p.money < sq.price) return reply('No te alcanza el dinero.');
      p.money -= sq.price;
      S.props[S.pending.idx].owner = p.id;
      log(`${p.name} compra ${sq.n} por ${$(sq.price)}.`);
      S.pending = null;
      break;
    }

    case 'decline':
      if (!myTurn || !S.pending || S.pending.type !== 'buy') return;
      log(`${p.name} decide no comprar ${BOARD[S.pending.idx].n}.`);
      S.pending = null;
      break;

    case 'end':
      if (!myTurn) return reply('No es tu turno.');
      if (S.pending) return reply('Resuelve primero lo pendiente.');
      if (!S.rolled) return reply('Primero tira los dados.');
      nextTurn();
      break;

    case 'payJail':
      if (!myTurn || !p.inJail || S.rolled || S.pending) return reply('No puedes pagar la fianza ahora.');
      if (p.money < JAIL_FEE) return reply('No te alcanza para la fianza.');
      p.money -= JAIL_FEE;
      p.inJail = false;
      p.jailTurns = 0;
      log(`${p.name} paga ${$(JAIL_FEE)} de fianza y sale de la cárcel.`);
      break;

    case 'jailCard':
      if (!myTurn || !p.inJail || S.rolled || S.pending || p.jailCards < 1) return reply('No puedes usar esa carta ahora.');
      p.jailCards--;
      p.inJail = false;
      p.jailTurns = 0;
      S.decks.chance.push(JAILCARD);
      log(`${p.name} usa su carta y sale de la cárcel.`);
      break;

    case 'payDebt': {
      const d = S.pending;
      if (!playing || !d || d.type !== 'debt' || d.pid !== p.id) return reply('No tienes deudas.');
      if (p.money < d.amount) return reply('Todavía no te alcanza. Hipoteca o vende construcciones.');
      S.pending = null;
      settle(p, d.amount, d.to, d.unit, d.reason);
      if (d.then && d.then.move) move(p, d.then.move);
      break;
    }

    case 'bankrupt': {
      if (!playing) return;
      const d = S.pending;
      const creditor = d && d.pid === p.id && d.type === 'debt' && d.to !== 'bank' && d.to !== 'each' ? byId(d.to) : null;
      bankrupt(p, creditor);
      break;
    }

    case 'build': {
      if (!playing) return;
      const e = buildErr(p, i);
      if (e) return reply(e);
      const cost = GROUPS[BOARD[i].g].h;
      p.money -= cost;
      S.props[i].houses++;
      log(`${p.name} construye en ${BOARD[i].n} (${S.props[i].houses === 5 ? 'hotel' : S.props[i].houses + ' casa(s)'}) por ${$(cost)}.`);
      break;
    }

    case 'sell': {
      if (!playing) return;
      const e = sellErr(p, i);
      if (e) return reply(e);
      const back = GROUPS[BOARD[i].g].h / 2;
      p.money += back;
      S.props[i].houses--;
      log(`${p.name} vende una construcción de ${BOARD[i].n} y recibe ${$(back)}.`);
      break;
    }

    case 'mortgage': {
      if (!playing) return;
      const e = mortgageErr(p, i);
      if (e) return reply(e);
      S.props[i].mortgaged = true;
      p.money += BOARD[i].price / 2;
      log(`${p.name} hipoteca ${BOARD[i].n} y recibe ${$(BOARD[i].price / 2)}.`);
      break;
    }

    case 'unmortgage': {
      if (!playing) return;
      const st = S.props[i];
      if (!st || st.owner !== p.id || !st.mortgaged) return reply('No se puede deshipotecar.');
      const cost = Math.ceil(BOARD[i].price * 0.55);
      if (p.money < cost) return reply('Necesitas ' + $(cost) + ' para deshipotecar.');
      p.money -= cost;
      st.mortgaged = false;
      log(`${p.name} deshipoteca ${BOARD[i].n} por ${$(cost)}.`);
      break;
    }

    case 'trade': {
      if (!playing) return;
      if (S.trade) return reply('Ya hay un trato abierto. Espera o cancélalo.');
      const t = {
        from: p.id,
        to: String(m.to),
        give: { props: (m.give?.props || []).map(Number), money: num(m.give?.money) },
        get: { props: (m.get?.props || []).map(Number), money: num(m.get?.money) },
      };
      const e = tradeErr(t);
      if (e) return reply(e);
      S.trade = t;
      log(`${p.name} le propone un trato a ${byId(t.to).name}.`);
      break;
    }

    case 'tradeAccept': {
      const t = S.trade;
      if (!playing || !t || t.to !== p.id) return;
      const e = tradeErr(t);
      S.trade = null;
      if (e) return reply('El trato ya no es válido: ' + e);
      applyTrade(t);
      break;
    }

    case 'tradeCancel': {
      const t = S.trade;
      if (!t || (t.to !== p.id && t.from !== p.id)) return;
      S.trade = null;
      log(`Se canceló el trato entre ${byId(t.from).name} y ${byId(t.to).name}.`);
      break;
    }

    default:
      break;
  }
}

/* ------------------------------------------------------------------ */
/*  RED                                                                */
/* ------------------------------------------------------------------ */
function lanIP() {
  const nets = os.networkInterfaces();
  for (const k of Object.keys(nets)) {
    for (const n of nets[k]) if (n.family === 'IPv4' && !n.internal) return n.address;
  }
  return 'localhost';
}
const IP = lanIP();
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
// URL que se muestra en el QR: la pública si existe; si no, la del host con el que se abrió la página.
function joinUrl(req) {
  if (PUBLIC_URL) return PUBLIC_URL + '/';
  const host = (req && req.headers.host) || `${IP}:${PORT}`;
  const proto = (req && req.headers['x-forwarded-proto']) || 'http';
  const h = /^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? `${IP}:${PORT}` : host;
  return `${String(proto).split(',')[0]}://${h}/`;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/qr.svg') {
    const svg = await QRCode.toString(joinUrl(req), { type: 'svg', margin: 1, color: { dark: '#0b2a1f', light: '#ffffff' } });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
    return res.end(svg);
  }
  if (url === '/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ join: joinUrl(req) }));
  }
  let file = url === '/' ? '/play.html' : url === '/tv' ? '/tv.html' : url;
  file = path.join(__dirname, 'public', path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('No encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

function pub() {
  const conn = new Set();
  for (const c of wss.clients) if (c.pid) conn.add(c.pid);
  return {
    phase: S.phase,
    players: S.players.map((p) => ({
      id: p.id, name: p.name, color: p.color, emoji: p.emoji, money: p.money, pos: p.pos,
      inJail: p.inJail, jailCards: p.jailCards, bankrupt: p.bankrupt, connected: conn.has(p.id),
      host: isHost(p),
    })),
    props: S.props,
    turn: S.players[S.turn] ? S.players[S.turn].id : null,
    rolled: S.rolled,
    dice: S.dice,
    rollN: S.rollN,
    dbl: S.dbl,
    pending: S.pending,
    log: S.log.slice(-40),
    card: S.card,
    winner: S.winner,
    trade: S.trade,
  };
}
function send(ws, o) {
  if (ws.readyState === 1) ws.send(JSON.stringify(o));
}
function broadcast() {
  const s = pub();
  for (const ws of wss.clients) send(ws, { a: 'state', s, you: ws.pid || null });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  send(ws, { a: 'board', board: BOARD, groups: GROUPS });
  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch (e) {
      return;
    }
    try {
      handle(ws, m, (msg) => send(ws, { a: 'err', m: msg }));
    } catch (e) {
      console.error('Error en acción', m && m.a, e);
    }
    broadcast();
  });
  ws.on('close', () => broadcast());
  broadcast();
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n  🎲  TURISTA listo\n');
  const base = PUBLIC_URL ? PUBLIC_URL + '/' : `http://${IP}:${PORT}/`;
  console.log(`  TV (tablero):     ${base}tv`);
  console.log(`  Jugadores:        ${base}   (o escanean el QR en la TV)\n`);
});
