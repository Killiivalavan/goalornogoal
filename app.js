(function () {
  'use strict';

  const STORAGE_KEY = 'gng_state';
  const DECISION_SECONDS = 10;

  const body = document.body;
  const startBtn = document.getElementById('startBtn');
  const exitFsBtn = document.getElementById('exitFsBtn');
  const playerWrap = document.getElementById('playerWrap');
  const revealOverlay = document.getElementById('revealOverlay');
  const goalBtn = document.getElementById('goalBtn');
  const nogoalBtn = document.getElementById('nogoalBtn');
  const runOver = document.getElementById('runOver');
  const finalStreak = document.getElementById('finalStreak');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const emptyState = document.getElementById('emptyState');
  const streakVal = document.getElementById('streakVal');
  const timerEl = document.getElementById('timer');

  let clips = [];
  let state = 'LANDING';
  let currentClip = null;
  let streak = 0;
  let seen = new Set();
  let player = null;
  let playerReady = false;
  let timerInterval = null;
  let timerRemaining = DECISION_SECONDS;
  let pollRaf = null;
  let decisionResolved = false;
  let revealScheduled = false;
  let finalStreakValue = 0;

  // ---------- persistence ----------
  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return { streak: 0, seen: [] };
      const o = JSON.parse(raw);
      return { streak: Number(o.streak) || 0, seen: Array.isArray(o.seen) ? o.seen : [] };
    } catch (e) { return { streak: 0, seen: [] }; }
  }
  function saveState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ streak, seen: Array.from(seen) })); } catch (e) {}
  }
  function resetState() {
    streak = 0; seen = new Set(); saveState(); updateStreakUI();
  }

  // ---------- views ----------
  function setView(name) { body.classList.remove('view-landing', 'view-game'); body.classList.add('view-' + name); }
  function showEl(el, show) { el.hidden = !show; }

  // ---------- clip helpers ----------
  function sa(c) { return (c && typeof c.startAt === 'number') ? c.startAt : 0; }
  function ea(c) { return (c && typeof c.endAt === 'number') ? c.endAt : null; }

  function updateStreakUI() { streakVal.textContent = streak; }
  function updateTimerUI() { timerEl.textContent = Math.max(0, Math.ceil(timerRemaining)); }

  function clearRevealVisuals() {
    playerWrap.classList.remove('correct', 'wrong');
    revealOverlay.hidden = true;
    revealOverlay.textContent = '';
    revealOverlay.classList.remove('goal', 'nogoal');
  }

  function isValidClip(c) {
    if (!c || typeof c.videoId !== 'string') return false;
    const s = sa(c);
    if (typeof c.pauseAt !== 'number' || !(c.pauseAt > s)) return false;
    if (c.answer !== 'goal' && c.answer !== 'nogoal') return false;
    const e = ea(c);
    if (e != null && (typeof e !== 'number' || !(e > c.pauseAt))) return false;
    return true;
  }

  function pickUnseen() {
    if (!clips.length) return null;
    let unseen = clips.filter(c => !seen.has(c.id));
    if (unseen.length === 0) {
      seen.clear(); saveState();
      unseen = clips.filter(c => !seen.has(c.id));
    }
    if (unseen.length === 0) return null;
    return unseen[Math.floor(Math.random() * unseen.length)];
  }

  // ---------- timer ----------
  function startTimer() {
    clearInterval(timerInterval);
    timerRemaining = DECISION_SECONDS;
    updateTimerUI();
    timerInterval = setInterval(() => {
      timerRemaining -= 0.1;
      if (timerRemaining <= 0) {
        timerRemaining = 0; updateTimerUI(); clearInterval(timerInterval);
        if (state === 'DECISION' && !decisionResolved) { decisionResolved = true; goReveal(null); }
      } else updateTimerUI();
    }, 100);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  // ---------- polling ----------
  function startPoll() { if (!pollRaf) pollRaf = requestAnimationFrame(poll); }
  function stopPoll() { if (pollRaf) { cancelAnimationFrame(pollRaf); pollRaf = null; } }

  function poll() {
    pollRaf = null;
    if (!player || !player.getCurrentTime || !currentClip) { startPoll(); return; }
    let t; try { t = player.getCurrentTime(); } catch (e) { startPoll(); return; }
    const s = sa(currentClip), p = currentClip.pauseAt, e = ea(currentClip);

    if (state === 'PLAYING') {
      if (t < s) { try { player.seekTo(s, true); } catch (e) {} }
      if (t >= p) {
        try { player.pauseVideo(); player.seekTo(p, true); } catch (e) {}
        goDecision(); return;
      }
    } else if (state === 'DECISION') {
      if (t < s) { try { player.seekTo(s, true); } catch (e) {} }
      if (t > p + 0.15) { try { player.pauseVideo(); player.seekTo(p, true); } catch (e) {} }
    } else if (state === 'REVEAL') {
      if (t < s) { try { player.seekTo(s, true); } catch (e) {} }
      if (e != null && t >= e) {
        console.log('REVEAL reached endAt', t, e);
        try { player.pauseVideo(); player.seekTo(e, true); } catch (e) {}
        if (!revealScheduled) scheduleRevealAdvance();
      } else if (e != null) {
        // console.log('REVEAL progress', t, '/', e);
      }
    }
    startPoll();
  }

  // ---------- player ----------
  function ensurePlayer(clip) {
    const s = sa(clip);
    if (player) {
      playerReady = true;
      try { player.loadVideoById({ videoId: clip.videoId, startSeconds: s }); }
      catch (e) { try { player.loadVideoById(clip.videoId, s); } catch (e2) {} }
      return;
    }
    player = new YT.Player('player', {
      videoId: clip.videoId,
      playerVars: {
        mute: 1, autoplay: 1, controls: 0, disablekb: 1,
        modestbranding: 1, rel: 0, playsinline: 1, fs: 1,
        showinfo: 0, iv_load_policy: 3,
        origin: location.origin, start: Math.floor(s)
      },
      events: {
        onReady: (e) => {
          playerReady = true;
          try { e.target.mute(); } catch (e) {}
          try { e.target.seekTo(s, true); } catch (e) {}
          try { e.target.playVideo(); } catch (e) {}
        },
        onStateChange: (e) => {
          if (e.data === 1) { // PLAYING
            if (state === 'LOADING') { state = 'PLAYING'; clearRevealVisuals(); startPoll(); }
            else if (state === 'REVEAL' && !pollRaf) startPoll();
          } else if (e.data === 0) { // ENDED
            if (state === 'REVEAL' && ea(currentClip) == null && !revealScheduled) scheduleRevealAdvance();
          }
        },
        onError: () => handlePlayerError()
      }
    });
  }

  function handlePlayerError() {
    if (currentClip) { seen.add(currentClip.id); saveState(); }
    currentClip = null;
    stopPoll(); stopTimer(); clearRevealVisuals();
    setTimeout(loadNext, 200);
  }

  // ---------- flow ----------
  function loadNext() {
    stopPoll(); stopTimer();
    decisionResolved = false; revealScheduled = false;
    clearRevealVisuals();
    showEl(document.getElementById('runOver'), false);
    showEl(emptyState, false);

    const clip = pickUnseen();
    if (!clip) { showEl(emptyState, true); state = 'LANDING'; return; }
    if (!isValidClip(clip)) {
      // skip incomplete/invalid clips without punishment (treated like dead clips)
      seen.add(clip.id); saveState();
      setTimeout(loadNext, 0);
      return;
    }
    currentClip = clip;
    seen.add(clip.id); saveState();
    state = 'LOADING';
    setView('game');
    ensurePlayer(clip);
    if (player) startPoll();
  }

  function goDecision() {
    if (state !== 'PLAYING') return;
    state = 'DECISION';
    goalBtn.disabled = false; nogoalBtn.disabled = false;
    startTimer(); startPoll();
  }

  function goReveal(guess) {
    if (state !== 'DECISION') return;
    state = 'REVEAL';
    stopTimer();
    goalBtn.disabled = true; nogoalBtn.disabled = true;

    const correct = (guess !== null && guess === currentClip.answer);
    const prevStreak = streak;
    if (correct) {
      streak = streak + 1;
    } else {
      finalStreakValue = prevStreak;
      streak = 0;
    }
    saveState(); updateStreakUI();

    const isGoal = currentClip.answer === 'goal';
    if (correct) {
      playerWrap.classList.add('correct');
      revealOverlay.textContent = '✓ ' + (isGoal ? 'Goal' : 'No Goal');
      revealOverlay.classList.add(isGoal ? 'goal' : 'nogoal');
    } else {
      playerWrap.classList.add('wrong');
      revealOverlay.textContent = '✗ ' + (isGoal ? 'Goal' : 'No Goal');
      revealOverlay.classList.add(isGoal ? 'goal' : 'nogoal');
    }
    revealOverlay.hidden = false;

    try { player.seekTo(currentClip.pauseAt, true); player.playVideo(); } catch (e) {}
    startPoll();
    const revealDelay = (ea(currentClip) != null ? ea(currentClip) - currentClip.pauseAt : 6) * 1000;
    setTimeout(() => {
      if (state !== 'REVEAL') return;
      try { if (ea(currentClip) != null) { player.pauseVideo(); player.seekTo(ea(currentClip), true); } } catch (e) {}
      if (!revealScheduled) scheduleRevealAdvance();
    }, Math.max(300, revealDelay));
    const backupMs = revealDelay + 1500;
    setTimeout(() => { if (state === 'REVEAL' && !revealScheduled) scheduleRevealAdvance(); }, backupMs);
  }

  function scheduleRevealAdvance() {
    if (revealScheduled) return;
    console.log('scheduleRevealAdvance called');
    revealScheduled = true;
    stopPoll();
    setTimeout(advanceReveal, 1200);
  }

  function advanceReveal() {
    const wasCorrect = playerWrap.classList.contains('correct');
    clearRevealVisuals();
    if (wasCorrect) loadNext(); else goRunOver();
  }

  function goRunOver() {
    state = 'RUN_OVER';
    stopPoll(); stopTimer();
    finalStreak.textContent = String(finalStreakValue);
    showEl(runOver, true);
    goalBtn.disabled = true; nogoalBtn.disabled = true;
  }

  // ---------- fullscreen ----------
  function requestFS() {
    const el = document.documentElement;
    if (el.requestFullscreen) return el.requestFullscreen().catch(() => {});
    if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
    return Promise.resolve();
  }
  function exitFS() {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }

  // ---------- init ----------
  async function init() {
    try {
      const res = await fetch('clips.json', { cache: 'no-store' });
      clips = await res.json();
      if (!Array.isArray(clips)) clips = [];
    } catch (e) { clips = []; }

    const s = loadState();
    streak = s.streak; seen = new Set(s.seen);
    updateStreakUI();
    setView('landing');

    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  }

  // ---------- events ----------
  startBtn.addEventListener('click', async () => {
    resetState();
    await requestFS();
    loadNext();
  });
  exitFsBtn.addEventListener('click', exitFS);
  goalBtn.addEventListener('click', () => {
    if (state !== 'DECISION' || decisionResolved) return;
    decisionResolved = true; goReveal('goal');
  });
  document.getElementById('nogoalBtn').addEventListener('click', () => {
    if (state !== 'DECISION' || decisionResolved) return;
    decisionResolved = true; goReveal('nogoal');
  });
  playAgainBtn.addEventListener('click', () => { resetState(); loadNext(); });

  init();
})();
