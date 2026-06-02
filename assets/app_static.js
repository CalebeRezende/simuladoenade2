import { EXAMS } from "./exams_static.js";

const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

let currentExam = null;
let answers = {};
let startedAt = null;
let submitted = false;
let timer = null;
let lastResultRecord = null;

function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function clock(ms) {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return fmtDur(t);
}

function left() {
  return Math.max(0, (currentExam.duration_minutes || 240) * 60000 - (Date.now() - startedAt));
}

function tick() {
  const l = left();
  el("timer").textContent = clock(l);
  if (l <= 0 && !submitted) submitExam(true);
}

function showError(message) {
  el("examList").innerHTML = `<div class="alerta warn"><b>Erro:</b> ${esc(message)}</div>`;
}

function loadExams() {
  try {
    if (!Array.isArray(EXAMS) || EXAMS.length === 0) {
      showError("Nenhuma prova foi encontrada em assets/exams_static.js.");
      return;
    }

    el("examList").innerHTML = EXAMS.map(ex => `
      <div class="examCard" data-id="${esc(ex.id)}">
        <div class="qhead">
          <h3>${esc(ex.title)}</h3>
          <span class="pill">${ex.duration_minutes || 240} min</span>
        </div>
        <p>${esc(ex.description || "")}</p>
        <span class="tag">${(ex.questions || []).length} questões</span>
      </div>
    `).join("");

    document.querySelectorAll(".examCard").forEach(card => {
      card.onclick = () => selectExam(card.dataset.id);
    });
  } catch (err) {
    showError(err.message || "Falha ao carregar as provas.");
  }
}

function selectExam(id) {
  currentExam = EXAMS.find(e => e.id === id);

  if (!currentExam) {
    alert("Não encontrei esta prova. Atualize a página com Ctrl + F5.");
    return;
  }

  el("selectedTitle").textContent = currentExam.title;
  el("setup").classList.remove("hide");
  el("studentPanel").scrollIntoView({ behavior: "smooth" });
}

function startExam() {
  const name = el("studentName").value.trim();

  if (!name) {
    alert("Digite seu nome para começar.");
    return;
  }

  if (!currentExam || !Array.isArray(currentExam.questions) || currentExam.questions.length === 0) {
    alert("Esta prova não tem questões carregadas. Confira o arquivo assets/exams_static.js.");
    return;
  }

  answers = {};
  startedAt = Date.now();
  submitted = false;
  lastResultRecord = null;

  const downloadBtn = el("downloadBtn");
  if (downloadBtn) downloadBtn.disabled = true;

  el("examChooser").classList.add("hide");
  el("setup").classList.add("hide");
  el("examArea").classList.remove("hide");
  el("resultado").style.display = "none";
  el("saveStatus").innerHTML = "";
  el("examTitle").textContent = currentExam.title;
  el("qCount").textContent = `${currentExam.questions.length} questões`;

  renderQuestions(false);
  clearInterval(timer);
  tick();
  timer = setInterval(tick, 1000);
}

function renderQuestions(lock) {
  el("questions").innerHTML = currentExam.questions.map((q, idx) => {
    const img = q.image_url
      ? `<img class="question-img" src="${esc(q.image_url)}" alt="Questão ${idx + 1}" onerror="this.insertAdjacentHTML('afterend','<div class=&quot;alerta warn&quot;>Imagem não carregou: ${esc(q.image_url)}</div>'); this.style.display='none';">`
      : `<div class="alerta warn">Imagem não encontrada para a questão ${esc(q.number_original)}.</div>`;

    const opts = ["A","B","C","D"].map(letter => `
      <label class="alt">
        <input type="radio" name="q_${idx}" value="${letter}" ${answers[idx] === letter ? "checked" : ""} ${lock || q.is_anulada ? "disabled" : ""}>
        ${letter}
      </label>
    `).join("");

    return `
      <article class="qcard" id="card_${idx}">
        <div class="qhead">
          <div>
            <span class="pill">Questão ${idx + 1}</span>
            ${q.disciplina ? `<span class="tag">${esc(q.disciplina)}</span>` : ""}
            ${q.prova_origem ? `<span class="tag">${esc(q.prova_origem)}</span>` : ""}
          </div>
          <span class="muted">Original: ${esc(q.number_original)}</span>
        </div>
        ${img}
        <div>${opts}</div>
        ${q.is_anulada ? `<p class="muted"><b>Questão anulada:</b> conta como acerto automaticamente.</p>` : ""}
      </article>
    `;
  }).join("");

  document.querySelectorAll("input[type=radio]").forEach(input => {
    input.onchange = e => {
      answers[e.target.name.replace("q_", "")] = e.target.value;
      localStorage.setItem("simulado_respostas_temp", JSON.stringify(answers));
    };
  });
}

function score() {
  let correct = 0, wrong = 0, blank = 0, anuladas = 0;
  const details = [];

  currentExam.questions.forEach((q, idx) => {
    const selected = answers[idx] || "";
    let status = "wrong";

    if (q.is_anulada) {
      correct++;
      anuladas++;
      status = "auto";
    } else if (!selected) {
      blank++;
      status = "blank";
    } else if (selected === q.correct_answer) {
      correct++;
      status = "correct";
    } else {
      wrong++;
    }

    details.push({
      position: idx + 1,
      original: q.number_original,
      selected,
      correct_answer: q.correct_answer,
      status
    });
  });

  return {
    correct, wrong, blank, anuladas, details,
    total: currentExam.questions.length,
    percentual: Number(((correct / currentExam.questions.length) * 100).toFixed(2))
  };
}

function saveLocally(record) {
  const old = JSON.parse(localStorage.getItem("resultados_simulados") || "[]");
  old.push(record);
  localStorage.setItem("resultados_simulados", JSON.stringify(old));
}

async function saveToGoogleSheets(record) {
  const endpoint = window.RESULTS_ENDPOINT || "";
  if (!endpoint || endpoint.includes("COLE_AQUI")) {
    return { ok: false, reason: "endpoint_missing" };
  }

  const form = new URLSearchParams();
  form.append("payload", JSON.stringify(record));
  form.append("nome", record.nome);
  form.append("email", record.email || "");
  form.append("simulado", record.simulado);
  form.append("nota", record.nota);
  form.append("percentual", String(record.percentual));
  form.append("duracao", record.duracao);
  form.append("enviado_em", record.enviado_em);

  try {
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      body: form
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message || "fetch_error" };
  }
}

function downloadLastResult() {
  if (!lastResultRecord) return;
  const blob = new Blob([JSON.stringify(lastResultRecord, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (lastResultRecord.nome || "participante").replace(/[^\w\-]+/g, "_");
  a.href = url;
  a.download = `resultado_${safeName}_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function submitExam(auto = false) {
  if (submitted) return;
  if (!auto && !confirm("Finalizar, corrigir e salvar agora? Depois disso as respostas serão bloqueadas.")) return;

  submitted = true;
  clearInterval(timer);

  const s = score();
  const dur = Math.round((Date.now() - startedAt) / 1000);

  renderQuestions(true);

  s.details.forEach((d, idx) => {
    const card = el("card_" + idx);
    if (card) card.style.borderColor = (d.status === "correct" || d.status === "auto") ? "#abefc6" : "#fecdca";
  });

  const resultRecord = {
    nome: el("studentName").value.trim(),
    email: el("studentEmail").value.trim(),
    simulado: currentExam.title,
    simulado_id: currentExam.id,
    nota: `${s.correct} de ${s.total}`,
    acertos: s.correct,
    erros: s.wrong,
    em_branco: s.blank,
    anuladas: s.anuladas,
    total: s.total,
    percentual: s.percentual,
    duracao: fmtDur(dur),
    duracao_segundos: dur,
    respostas: answers,
    correcao: s.details,
    enviado_em: new Date().toISOString(),
    user_agent: navigator.userAgent
  };

  lastResultRecord = resultRecord;
  saveLocally(resultRecord);

  const downloadBtn = el("downloadBtn");
  if (downloadBtn) downloadBtn.disabled = false;

  el("resultado").style.display = "block";
  el("resultado").innerHTML = `
    <h2>Resultado</h2>
    <div class="score">${s.correct} de ${s.total}</div>
    <p>${s.percentual}% de aproveitamento. Duração: ${fmtDur(dur)}</p>
    <div class="grid3">
      <div class="kpi">Acertos<strong>${s.correct}</strong></div>
      <div class="kpi">Erros<strong>${s.wrong}</strong></div>
      <div class="kpi">Em branco<strong>${s.blank}</strong></div>
    </div>
    <div class="alerta" style="margin-top:12px">
      Salvando resposta na planilha...
    </div>
  `;

  el("submitBtn").disabled = true;
  el("resultado").scrollIntoView({ behavior: "smooth" });

  const remote = await saveToGoogleSheets(resultRecord);
  const statusHtml = remote.ok
    ? `<div class="alerta"><b>Resposta enviada para a planilha.</b> Também ficou salva neste navegador e pode ser baixada em JSON.</div>`
    : `<div class="alerta warn"><b>A correção foi feita, mas a planilha ainda não está configurada ou não respondeu.</b> A resposta ficou salva neste navegador e pode ser baixada em JSON.</div>`;

  el("saveStatus").innerHTML = statusHtml;
}

function restart() {
  location.reload();
}

el("startBtn").onclick = startExam;
el("submitBtn").onclick = () => submitExam(false);
el("printBtn").onclick = () => window.print();
const downloadBtn = el("downloadBtn");
if (downloadBtn) downloadBtn.onclick = downloadLastResult;
el("restartBtn").onclick = () => restart();

loadExams();
