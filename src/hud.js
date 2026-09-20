// DOM layer: top bar (goal, clicks left, score), bottom notebook drawer, and the intro/result cards.
// Everything is set with textContent; nothing here ever shows a hotspot's id or name.

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function createHud() {
  const hud = document.getElementById('hud');
  const notebook = document.getElementById('notebook');
  const overlay = document.getElementById('overlay');

  // ---- Top bar ----
  const title = el('div', 'hud-title');
  const goal = el('div', 'hud-goal');
  const clicksLabel = el('span', 'hud-label');
  const clicksValue = el('span', 'hud-value');
  const scoreValue = el('span', 'hud-value');
  const clicks = el('div', 'hud-stat');
  clicks.append(clicksLabel, clicksValue);
  const score = el('div', 'hud-stat');
  score.append(el('span', 'hud-label', 'Score'), scoreValue);
  const action = el('button', 'hud-action hidden');
  hud.append(title, goal, clicks, score, action);

  // ---- Notebook drawer ----
  const nbTab = el('button', 'nb-tab', 'Field notebook');
  const nbBody = el('div', 'nb-body');
  const nbEmpty = el('div', 'nb-empty', 'Nothing recorded yet. Probe a hotspot and it lands here.');
  nbBody.append(nbEmpty);
  notebook.append(nbTab, nbBody);
  nbTab.addEventListener('click', () => notebook.classList.toggle('open'));
  const cards = new Map();

  // ---- Overlay card ----
  function card(heading, lines, buttons) {
    overlay.replaceChildren();
    const c = el('div', 'card');
    c.append(el('h2', null, heading));
    lines.forEach((l) => c.append(el('p', l.className, l.text)));
    const row = el('div', 'card-buttons');
    buttons.forEach((b) => {
      const btn = el('button', b.primary ? 'primary' : '', b.label);
      btn.addEventListener('click', b.onClick);
      row.append(btn);
    });
    c.append(row);
    overlay.append(c);
    overlay.classList.remove('hidden');
  }

  return {
    setLevel({ index, total, level }) {
      title.textContent = `${index + 1}/${total} · ${level.title}`;
      goal.textContent = level.goal_text;
    },

    // clicksLeft null = no budget (discovery); progress is shown there instead.
    setClicks(clicksLeft, progressText) {
      if (clicksLeft == null) {
        clicksLabel.textContent = 'Probed';
        clicksValue.textContent = progressText;
      } else {
        clicksLabel.textContent = 'Clicks left';
        clicksValue.textContent = String(clicksLeft);
      }
    },

    setScore(n) {
      scoreValue.textContent = String(n);
    },

    // Level 1's "Start Task 1" button: shown always in discovery, enabled once the game says so.
    setAction(label, enabled, onClick) {
      if (!label) return action.classList.add('hidden');
      action.classList.remove('hidden');
      action.textContent = label;
      action.disabled = !enabled;
      action.onclick = onClick;
    },

    showIntro(level, onStart) {
      card(level.title, [{ text: level.intro_text }, { className: 'goal', text: level.goal_text }], [
        { label: 'Start', primary: true, onClick: onStart },
      ]);
    },

    showResult({ won, gained, message, onRetry, onNext, nextLabel }) {
      const lines = [{ text: message }];
      if (won && gained != null) lines.push({ className: 'goal', text: `+${gained} points` });
      const buttons = [{ label: 'Retry', onClick: onRetry }];
      if (won && onNext) buttons.push({ label: nextLabel, primary: true, onClick: onNext });
      card(won ? 'Nice.' : 'Out of clicks', lines, buttons);
    },

    showFinished(score, onRestart) {
      card(
        'That is every level so far',
        [
          { text: `Final score: ${score}.` },
          {
            text: 'Weak spot mode is built at runtime from task_templates.json, which has not been provided yet.',
          },
        ],
        [{ label: 'Play again', primary: true, onClick: onRestart }],
      );
    },

    // A short message near the bottom of the screen that fades by itself.
    toast(text, ms = 3200) {
      let t = document.getElementById('toast');
      if (!t) {
        t = el('div');
        t.id = 'toast';
        document.getElementById('stage').append(t);
      }
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(t._timer);
      t._timer = setTimeout(() => t.classList.remove('show'), ms);
    },

    hideOverlay() {
      overlay.classList.add('hidden');
    },

    // ---- Notebook ----
    setNotebookVisible(visible) {
      notebook.classList.toggle('hidden', !visible);
      notebook.classList.remove('open'); // stays collapsed to its tab until the first probe is recorded
    },

    // One card per hotspot: the first probe's snapshots, the text, and a repeat count.
    recordProbe(id, text, count) {
      let c = cards.get(id);
      if (!c) {
        notebook.classList.add('open');
        nbEmpty.remove();
        c = { root: el('div', 'nb-card'), imgs: el('div', 'nb-imgs'), count: el('span', 'nb-count') };
        c.brain = el('img');
        c.arena = el('img');
        c.brain.alt = 'brain snapshot';
        c.arena.alt = 'arena snapshot';
        c.imgs.append(c.brain, c.arena);
        c.root.append(c.imgs, el('p', null, text), c.count);
        nbBody.append(c.root);
        cards.set(id, c);
      }
      c.count.textContent = count > 1 ? `probed ×${count}` : '';
    },

    setSnapshot(id, which, dataUrl) {
      const c = cards.get(id);
      if (c && !c[which].src) c[which].src = dataUrl;
    },
  };
}
