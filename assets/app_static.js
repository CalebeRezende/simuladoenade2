import { EXAMS } from "./exams_static.js";

const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

let currentExam = null;
let answers = {};
let startedAt = null;
let submitted = false;
let timer = null;

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

function loadExams() {
  el("examList").innerHTML = EXAMS.map(ex => `
    <div class="examCard" data-id="${esc(ex.id)}">
      <div class="qhead">
        <h3>${esc(ex.title)}</h3>
        <span class="pill">${ex.duration_minutes || 240} min</span>
      </div>
      <p>${esc(ex.description || "")}</p>
      <span class="tag">${ex.questions.length} questões</span>
    </div>
  `).join("");

  document.querySelectorAll(".examCard").forEach(card => {
    card.onclick = () => selectExam(card.dataset.id);
  });
}

function selectExam(id) {
  currentExam = EXAMS.find(e => e.id === id);
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

  answers = {};
  startedAt = Date.now();
  submitted = false;

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
      ? `<img class="question-img" src="${esc(q.image_url)}" alt="Questão ${idx + 1}">`
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

function submitExam(auto = false) {
  if (submitted) return;
  if (!auto && !confirm("Finalizar e corrigir agora? Depois disso as respostas serão bloqueadas.")) return;

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
    nota: `${s.correct} de ${s.total}`,
    percentual: s.percentual,
    duracao: fmtDur(dur),
    respostas: answers,
    correcao: s.details,
    enviado_em: new Date().toISOString()
  };

  const old = JSON.parse(localStorage.getItem("resultados_simulados") || "[]");
  old.push(resultRecord);
  localStorage.setItem("resultados_simulados", JSON.stringify(old));

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
      Resultado salvo neste navegador. Para registrar em banco/e-mail, será preciso reativar envio externo depois.
    </div>
  `;

  el("submitBtn").disabled = true;
  el("resultado").scrollIntoView({ behavior: "smooth" });
}

function restart() {
  location.reload();
}

el("startBtn").onclick = startExam;
el("submitBtn").onclick = () => submitExam(false);
el("printBtn").onclick = () => window.print();
el("restartBtn").onclick = restart;

loadExams();
