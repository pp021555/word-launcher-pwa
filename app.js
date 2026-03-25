const STORAGE_KEYS = {
  wordBook: "pwa_word_book_local",
  wrongBook: "pwa_wrong_book_local",
  stats: "pwa_word_stats_local",
  lastImportTime: "pwa_last_import_time",
  importMeta: "pwa_import_meta"
};

let deferredPrompt = null;
let wordBook = {};
let wrongBook = [];
let stats = { totalAnswered: 0, totalCorrect: 0 };

let currentMode = null; // random / group / wrong / group_view
let currentQuestions = [];
let currentIndex = 0;
let currentQuestion = null;
let answeredCurrentQuestion = false;

let currentGroupViewList = [];
let currentGroupViewIndex = 0;

function normalizeText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function saveWordBook() {
  saveJson(STORAGE_KEYS.wordBook, wordBook);
}

function saveWrongBook() {
  saveJson(STORAGE_KEYS.wrongBook, wrongBook);
}

function saveStats() {
  saveJson(STORAGE_KEYS.stats, stats);
}

function loadLocalData() {
  wordBook = loadJson(STORAGE_KEYS.wordBook, {});
  wrongBook = loadJson(STORAGE_KEYS.wrongBook, []);
  stats = loadJson(STORAGE_KEYS.stats, { totalAnswered: 0, totalCorrect: 0 });
}

function nowText() {
  const now = new Date();
  return (
    now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0") + " " +
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0") + ":" +
    String(now.getSeconds()).padStart(2, "0")
  );
}

function updateSyncInfo(text, cls = "muted") {
  const box = document.getElementById("syncInfo");
  box.className = `info-box ${cls}`;
  box.innerText = text;
}

function setResult(text, cls = "muted") {
  const box = document.getElementById("resultBox");
  box.className = `result-box ${cls}`;
  box.innerText = text;
}

function setQuestion(text, typeText) {
  document.getElementById("questionBox").innerText = text;
  document.getElementById("questionType").innerText = `当前题型：${typeText}`;
}

function setProgress(total, current) {
  document.getElementById("progressText").innerText = `总计：${total} 个，当前：${current} / ${total}`;
}

function getDirection() {
  return document.getElementById("directionSelect").value;
}

function flattenWordBook(data) {
  const arr = [];
  for (const group in data) {
    const words = data[group] || [];
    for (const item of words) {
      arr.push({
        group,
        word: item.word,
        meaning: item.meaning
      });
    }
  }
  return arr;
}

function countWords(data) {
  return flattenWordBook(data).length;
}

function buildQuestionPayload(item, group, direction) {
  if (direction === "en_to_zh") {
    return {
      group,
      item: { word: item.word, meaning: item.meaning },
      prompt: item.word,
      answer: item.meaning,
      typeText: "英文 → 中文"
    };
  }
  return {
    group,
    item: { word: item.word, meaning: item.meaning },
    prompt: item.meaning,
    answer: item.word,
    typeText: "中文 → 英文"
  };
}

function renderGroups() {
  const groupSelect = document.getElementById("groupSelect");
  groupSelect.innerHTML = "";

  const groups = Object.keys(wordBook);
  if (!groups.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "暂无分组，请先导入更新包";
    groupSelect.appendChild(option);
    return;
  }

  for (const group of groups) {
    const option = document.createElement("option");
    option.value = group;
    option.textContent = `${group}（${(wordBook[group] || []).length}个）`;
    groupSelect.appendChild(option);
  }
}

function renderStats() {
  const totalAnswered = Number(stats.totalAnswered || 0);
  const totalCorrect = Number(stats.totalCorrect || 0);
  const rate = totalAnswered ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const totalWords = countWords(wordBook);

  document.getElementById("statsBox").innerText =
    `本地词库：${totalWords} 个\n` +
    `本地错题本：${wrongBook.length} 个\n` +
    `已答题：${totalAnswered}\n` +
    `答对：${totalCorrect}\n` +
    `正确率：${rate}%`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderAllWords() {
  const box = document.getElementById("allWordsBox");
  const groups = Object.keys(wordBook);

  if (!groups.length) {
    box.className = "info-box muted";
    box.innerText = "暂无本地词库，请先导入更新包。";
    return;
  }

  let html = "";
  for (const group of groups) {
    html += `<div class="group-title">${escapeHtml(group)}</div>`;
    const words = wordBook[group] || [];
    for (const item of words) {
      html += `<div class="word-item">${escapeHtml(item.word)} = ${escapeHtml(item.meaning)}</div>`;
    }
  }
  box.className = "info-box";
  box.innerHTML = html;
}

function normalizeGroupValue(value) {
  if (!value) return "";
  return value.replace(/（\d+个）$/, "").trim();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = arr[i];
    arr[i] = arr[j];
    arr[j] = temp;
  }
}

function showQuestion(question) {
  currentQuestion = question;
  answeredCurrentQuestion = false;
  setQuestion(question.prompt, question.typeText);

  if (currentMode === "random") {
    setProgress(1, 1);
  } else {
    setProgress(currentQuestions.length, currentIndex + 1);
  }

  document.getElementById("answerInput").value = "";
  setResult("结果：请先输入答案，然后点击“提交答案”", "muted");
  document.getElementById("answerInput").focus();
}

function showGroupViewItem() {
  if (!currentGroupViewList.length) {
    setQuestion("本组没有单词", "本组查看模式");
    setProgress(0, 0);
    setResult("结果：当前分组没有内容", "muted");
    document.getElementById("answerInput").value = "";
    return;
  }

  const item = currentGroupViewList[currentGroupViewIndex];
  const total = currentGroupViewList.length;
  const current = currentGroupViewIndex + 1;

  setQuestion(`${item.word}\n${item.meaning}`, "本组查看模式");
  setProgress(total, current);
  setResult("结果：这是查看模式，可直接浏览本组单词", "success");
  document.getElementById("answerInput").value = "";
}

function showSelectedGroupWords() {
  const rawGroupValue = document.getElementById("groupSelect").value;
  const group = normalizeGroupValue(rawGroupValue);

  if (!group || !wordBook[group] || !wordBook[group].length) {
    alert("请选择有效分组，或先导入更新包。");
    return;
  }

  currentMode = "group_view";
  currentGroupViewList = [...wordBook[group]];
  currentGroupViewIndex = 0;
  currentQuestion = null;
  answeredCurrentQuestion = false;

  showGroupViewItem();
}

function startRandomQuiz() {
  const all = flattenWordBook(wordBook);
  if (!all.length) {
    alert("本地没有词库，请先导入更新包。");
    return;
  }

  const randomIndex = Math.floor(Math.random() * all.length);
  const picked = all[randomIndex];
  const direction = getDirection();

  currentMode = "random";
  currentQuestions = [buildQuestionPayload(picked, picked.group, direction)];
  currentIndex = 0;

  showQuestion(currentQuestions[0]);
}

function startGroupReview() {
  const rawGroupValue = document.getElementById("groupSelect").value;
  const group = normalizeGroupValue(rawGroupValue);

  if (!group || !wordBook[group] || !wordBook[group].length) {
    alert("请选择有效分组，或先导入更新包。");
    return;
  }

  const direction = getDirection();
  const items = [...wordBook[group]];
  shuffleArray(items);

  currentMode = "group";
  currentQuestions = items.map(item => buildQuestionPayload(item, group, direction));
  currentIndex = 0;

  showQuestion(currentQuestions[0]);
}

function startWrongReview() {
  if (!wrongBook.length) {
    alert("本地错题本为空。");
    return;
  }

  const direction = getDirection();
  const items = [...wrongBook];
  shuffleArray(items);

  currentMode = "wrong";
  currentQuestions = items.map(item =>
    buildQuestionPayload(
      { word: item.word, meaning: item.meaning },
      item.group,
      direction
    )
  );
  currentIndex = 0;

  showQuestion(currentQuestions[0]);
}

function addToWrongBook(group, word, meaning) {
  for (const entry of wrongBook) {
    if (
      normalizeText(entry.group) === normalizeText(group) &&
      normalizeText(entry.word) === normalizeText(word)
    ) {
      entry.wrong_count = Number(entry.wrong_count || 1) + 1;
      saveWrongBook();
      renderStats();
      return;
    }
  }

  wrongBook.push({
    group,
    word,
    meaning,
    wrong_count: 1
  });

  saveWrongBook();
  renderStats();
}

function submitAnswer() {
  if (currentMode === "group_view") {
    alert("当前是查看模式，不需要提交答案。请点“上一题”或“下一题”继续浏览。");
    return;
  }

  if (!currentQuestion) {
    alert("请先开始练习。");
    return;
  }

  if (answeredCurrentQuestion) {
    alert("这一题已经提交过了，请点下一题。");
    return;
  }

  const userAnswer = document.getElementById("answerInput").value.trim();
  if (!userAnswer) {
    alert("请输入答案后再提交。");
    return;
  }

  const isCorrect = normalizeText(userAnswer) === normalizeText(currentQuestion.answer);

  stats.totalAnswered = Number(stats.totalAnswered || 0) + 1;
  if (isCorrect) {
    stats.totalCorrect = Number(stats.totalCorrect || 0) + 1;
  } else {
    addToWrongBook(
      currentQuestion.group,
      currentQuestion.item.word,
      currentQuestion.item.meaning
    );
  }

  saveStats();
  renderStats();

  if (isCorrect) {
    setResult(
      `结果：回答正确\n你的答案：${userAnswer}\n正确答案：${currentQuestion.answer}\n分组：${currentQuestion.group}`,
      "success"
    );
  } else {
    setResult(
      `结果：回答错误\n你的答案：${userAnswer}\n正确答案：${currentQuestion.answer}\n分组：${currentQuestion.group}`,
      "error"
    );
  }

  answeredCurrentQuestion = true;
}

function previousQuestion() {
  if (!currentMode) {
    alert("请先开始练习或查看。");
    return;
  }

  if (currentMode !== "group_view") {
    alert("“上一题”目前用于“显示本组”的浏览模式。");
    return;
  }

  if (!currentGroupViewList.length) {
    alert("当前没有可查看的单词。");
    return;
  }

  if (currentGroupViewIndex <= 0) {
    currentGroupViewIndex = 0;
    setResult("结果：已经是本组第一个单词了", "warn-text");
    return;
  }

  currentGroupViewIndex -= 1;
  showGroupViewItem();
}

function nextQuestion() {
  if (!currentMode) {
    alert("请先开始练习或查看。");
    return;
  }

  if (currentMode === "group_view") {
    if (!currentGroupViewList.length) {
      alert("当前没有可查看的单词。");
      return;
    }

    currentGroupViewIndex += 1;
    if (currentGroupViewIndex >= currentGroupViewList.length) {
      currentGroupViewIndex = currentGroupViewList.length - 1;
      setResult("结果：已经看到本组最后一个单词了", "warn-text");
      return;
    }

    showGroupViewItem();
    return;
  }

  if (currentMode === "random") {
    startRandomQuiz();
    return;
  }

  currentIndex += 1;
  if (currentIndex >= currentQuestions.length) {
    setQuestion("本轮复习完成", "完成");
    setProgress(currentQuestions.length, currentQuestions.length);
    setResult("结果：已经全部做完。", "success");
    currentQuestion = null;
    return;
  }

  showQuestion(currentQuestions[currentIndex]);
}

function parseImportedWordPack(content) {
  const parsed = JSON.parse(content);

  if (parsed && parsed.ok === true && parsed.data && typeof parsed.data === "object") {
    return {
      wordBook: parsed.data,
      summary: parsed.summary || null
    };
  }

  if (parsed && parsed.word_book && typeof parsed.word_book === "object") {
    return {
      wordBook: parsed.word_book,
      summary: parsed.summary || null
    };
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return {
      wordBook: parsed,
      summary: null
    };
  }

  throw new Error("不是有效的词库更新包");
}

function importWordPack() {
  const fileInput = document.getElementById("wordPackFile");
  const file = fileInput.files[0];
  if (!file) {
    alert("请先选择更新包 JSON 文件。");
    return;
  }

  const ok = confirm(
    "确定导入更新包吗？\n\n这个操作会覆盖本地词库。\n本地错题本和统计会保留。"
  );
  if (!ok) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const result = parseImportedWordPack(e.target.result);
      wordBook = result.wordBook;
      saveWordBook();

      const importTime = nowText();
      localStorage.setItem(STORAGE_KEYS.lastImportTime, importTime);
      saveJson(STORAGE_KEYS.importMeta, {
        file_name: file.name,
        import_time: importTime,
        summary: result.summary || null
      });

      renderGroups();
      renderStats();
      renderAllWords();

      const summaryText = result.summary
        ? `\n分组数：${result.summary.group_count}\n单词数：${result.summary.word_count}`
        : `\n分组数：${Object.keys(wordBook).length}\n单词数：${countWords(wordBook)}`;

      updateSyncInfo(
        `更新包导入成功。\n文件：${file.name}${summaryText}\n导入时间：${importTime}`,
        "success"
      );
      alert("更新包导入成功。");
    } catch (err) {
      updateSyncInfo("导入失败：文件格式不正确。", "error");
      alert("导入失败：不是有效的 JSON 更新包。");
    }
  };
  reader.readAsText(file, "utf-8");
}

function exportLocalBackup() {
  const backup = {
    type: "pwa_word_app_backup",
    export_time: nowText(),
    word_book: wordBook,
    wrong_book: wrongBook,
    stats: stats
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "word_local_backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importLocalBackup() {
  const fileInput = document.getElementById("localBackupFile");
  const file = fileInput.files[0];
  if (!file) {
    alert("请先选择本地备份文件。");
    return;
  }

  const ok = confirm(
    "确定导入本地备份吗？\n\n这个操作会覆盖本地词库、本地错题本和本地统计。"
  );
  if (!ok) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !parsed.word_book) {
        throw new Error("bad backup");
      }

      wordBook = parsed.word_book || {};
      wrongBook = parsed.wrong_book || [];
      stats = parsed.stats || { totalAnswered: 0, totalCorrect: 0 };

      saveWordBook();
      saveWrongBook();
      saveStats();

      renderGroups();
      renderStats();
      renderAllWords();

      updateSyncInfo(
        `本地备份导入成功。\n文件：${file.name}\n导入时间：${nowText()}`,
        "success"
      );
      alert("本地备份导入成功。");
    } catch (err) {
      updateSyncInfo("本地备份导入失败：文件格式不正确。", "error");
      alert("导入失败：不是有效的本地备份文件。");
    }
  };
  reader.readAsText(file, "utf-8");
}

function clearWrongBook() {
  const ok = confirm("确定清空本地错题本吗？");
  if (!ok) return;

  wrongBook = [];
  saveWrongBook();
  renderStats();
  alert("本地错题本已清空。");
}

function resetLocalWordBook() {
  const ok = confirm("确定清空本地词库吗？\n这个操作不会影响电脑上的主词库。");
  if (!ok) return;

  wordBook = {};
  saveWordBook();
  renderGroups();
  renderStats();
  renderAllWords();

  currentMode = null;
  currentQuestions = [];
  currentIndex = 0;
  currentQuestion = null;
  answeredCurrentQuestion = false;
  currentGroupViewList = [];
  currentGroupViewIndex = 0;

  setQuestion("题目会显示在这里", "无");
  setProgress(0, 0);
  setResult("结果：本地词库已清空，请重新导入更新包。", "warn-text");
}

function initImportInfo() {
  const importMeta = loadJson(STORAGE_KEYS.importMeta, null);
  const totalWords = countWords(wordBook);

  if (!importMeta) {
    updateSyncInfo(
      `本地词库：${totalWords} 个\n尚未导入更新包。`,
      "muted"
    );
    return;
  }

  let text =
    `本地词库：${totalWords} 个\n` +
    `最近导入文件：${importMeta.file_name}\n` +
    `最近导入时间：${importMeta.import_time}`;

  if (importMeta.summary) {
    text +=
      `\n分组数：${importMeta.summary.group_count}` +
      `\n单词数：${importMeta.summary.word_count}`;
  }

  updateSyncInfo(text, "muted");
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("./sw.js");
    console.log("SW registered");
  } catch (err) {
    console.log("SW register failed", err);
  }
}

function initInstallPrompt() {
  const installBtn = document.getElementById("installBtn");

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.classList.remove("hidden");
  });

  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) {
      alert("当前浏览器没有直接触发安装提示。\n你也可以在浏览器菜单里选择“安装应用”或“添加到主屏幕”。");
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add("hidden");
  });
}

document.getElementById("answerInput").addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    submitAnswer();
  }
});

window.addEventListener("load", async function () {
  loadLocalData();
  renderGroups();
  renderStats();
  renderAllWords();
  initImportInfo();
  setQuestion("题目会显示在这里", "无");
  setProgress(0, 0);
  setResult("结果：等待开始", "muted");
  initInstallPrompt();
  await registerServiceWorker();
});
