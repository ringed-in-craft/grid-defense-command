/**
 * Canvas rendering. Draws from state, owns no state.
 *
 * One deliberate design point: when the operator is blind (no live feed to the
 * control centre) threat indicators are hidden. Drawing them would let the
 * player defend against something they are not supposed to be able to see.
 */

const SHAPES = {
  net: 'circle',
  soc: 'circle',
  gen: 'hex',
  sub: 'diamond',
  load: 'square'
};

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} state
 * @param {{width:number,height:number,time:number,selected:string|null,hover:string|null,blind:boolean}} view
 */
export function draw(ctx, state, view) {
  const { width: W, height: H, selected, hover, blind } = view;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const pw = css('--pw');
  const bad = css('--bad');
  const df = css('--df');
  const dim = css('--dim');
  const mu = css('--mu');
  const tx = css('--tx');
  const pn = css('--pn');

  ctx.clearRect(0, 0, W, H);

  // --- background grid ------------------------------------------------------
  ctx.strokeStyle = css('--ln');
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // --- links ----------------------------------------------------------------
  for (const [a, b] of state.links) {
    const na = state.nodes[a];
    const nb = state.nodes[b];
    const live = na.powered && nb.powered && na.online && nb.online;
    ctx.beginPath();
    ctx.moveTo(na.x * W, na.y * H);
    ctx.lineTo(nb.x * W, nb.y * H);
    ctx.strokeStyle = live ? pw : dim;
    ctx.lineWidth = live ? 2.5 : 1.5;
    ctx.setLineDash(na.segmented || nb.segmented ? [2, 5] : live ? [8, 8] : []);
    ctx.lineDashOffset = live ? -view.time / 40 : 0;
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // --- packets (attack traffic in flight) -----------------------------------
  for (const p of state.packets) {
    const a = state.nodes[p.from];
    const b = state.nodes[p.to];
    if (!a || !b) continue;
    ctx.fillStyle = bad;
    ctx.beginPath();
    ctx.arc((a.x + (b.x - a.x) * p.t) * W, (a.y + (b.y - a.y) * p.t) * H, 4.5, 0, 7);
    ctx.fill();
  }

  // --- nodes ----------------------------------------------------------------
  for (const id in state.nodes) {
    const n = state.nodes[id];
    const x = n.x * W;
    const y = n.y * H;
    const isSelected = id === selected;
    const isHover = id === hover;
    const down = !n.online;
    const colour =
      n.type === 'net' ? mu : down ? dim : n.powered || n.type === 'soc' ? pw : mu;

    ctx.beginPath();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = colour;
    ctx.fillStyle = pn;
    const shape = SHAPES[n.type] || 'circle';
    if (shape === 'hex') {
      for (let i = 0; i < 6; i++) ctx.lineTo(x + 20 * Math.cos(i * 1.047), y + 20 * Math.sin(i * 1.047));
      ctx.closePath();
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - 19);
      ctx.lineTo(x + 19, y);
      ctx.lineTo(x, y + 19);
      ctx.lineTo(x - 19, y);
      ctx.closePath();
    } else if (shape === 'square') {
      ctx.rect(x - 16, y - 16, 32, 32);
    } else {
      ctx.arc(x, y, n.type === 'net' ? 14 : 19, 0, 7);
    }
    ctx.fill();
    ctx.stroke();

    // Hospital cross
    if (n.type === 'load' && n.weight >= 3) {
      ctx.fillStyle = colour;
      ctx.fillRect(x - 2, y - 9, 4, 18);
      ctx.fillRect(x - 9, y - 2, 18, 4);
    }

    // Control centre inner ring
    if (n.type === 'soc') {
      ctx.strokeStyle = down ? dim : df;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 7);
      ctx.stroke();
    }

    // Threat dwell ring — suppressed while blind.
    if (n.threat && n.online && !blind) {
      const pulse = 0.5 + 0.5 * Math.sin(view.time / 150);
      ctx.strokeStyle = bad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 27 + pulse * 3, -1.57, -1.57 + n.threat.progress * 0.0628);
      ctx.stroke();
      ctx.globalAlpha = 0.25 + 0.2 * pulse;
      ctx.fillStyle = bad;
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // A blind operator sees only "something is wrong here", not what.
    if (n.threat && n.online && blind) {
      ctx.fillStyle = bad;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    if (n.firewall > 0) {
      ctx.strokeStyle = df;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 32, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (n.segmented) {
      ctx.strokeStyle = tx;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([1, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 36, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (n.isolation > 0) {
      ctx.strokeStyle = pw;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.arc(x, y, 24, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (down) {
      ctx.strokeStyle = bad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 8);
      ctx.lineTo(x + 8, y + 8);
      ctx.moveTo(x + 8, y - 8);
      ctx.lineTo(x - 8, y + 8);
      ctx.stroke();
    }

    // Hardening pips
    for (let i = 0; i < n.hardening; i++) {
      ctx.fillStyle = df;
      ctx.beginPath();
      ctx.arc(x - 8 + i * 8, y + 31, 3, 0, 7);
      ctx.fill();
    }

    if (isSelected || isHover) {
      ctx.strokeStyle = tx;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(x - 30, y - 30, 60, 60);
    }

    ctx.fillStyle = tx;
    ctx.font = '12px "Chakra Petch", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(n.name, x, y - (n.type === 'net' ? 20 : 32));
  }

  // --- blind banner ---------------------------------------------------------
  if (blind) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, H - 34, W, 34);
    ctx.fillStyle = bad;
    ctx.font = 'bold 14px "Chakra Petch", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SENSOR FEED LOST — control centre dark. Threat indicators unavailable.', W / 2, H - 13);
  }
}
