/**
 * EduVault - Core Application Logic
 * Pure client-side, zero server dependencies, fully anonymous
 */

const app = {
  exams: [],
  currentExam: null,
  currentMode: 'home', // 'home' | 'reader' | 'exam' | 'practice' | 'result'
  
  // State for Reader
  readerShowAnswers: false,

  // State for Timed Exam
  examTimerInterval: null,
  examSecondsRemaining: 0,
  examTotalSeconds: 0,
  examUserAnswers: {}, // { questionId: optionIndex }
  examFlaggedQuestions: {}, // { questionId: true/false }

  // State for Practice
  practiceAnswers: {}, // { questionId: { selected: number, isCorrect: boolean } }

  // State for Result
  lastExamResult: null,

  // Active Filters
  activeSubject: 'ALL',
  activeGrade: 'ALL',
  searchQuery: '',

  /**
   * Initialize App
   */
  async init() {
    this.initTheme();
    await this.loadExams();
    this.renderSubjectFilters();
    this.renderExamsList();
    this.initLucide();
  },

  /**
   * Theme Management (Dark / Light)
   */
  initTheme() {
    const savedTheme = localStorage.getItem('eduvault_theme') || 'light';
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      document.getElementById('sun-icon')?.classList.remove('hidden');
      document.getElementById('moon-icon')?.classList.add('hidden');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
      document.getElementById('sun-icon')?.classList.add('hidden');
      document.getElementById('moon-icon')?.classList.remove('hidden');
    }
  },

  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      localStorage.setItem('eduvault_theme', 'light');
      document.getElementById('sun-icon')?.classList.add('hidden');
      document.getElementById('moon-icon')?.classList.remove('hidden');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
      localStorage.setItem('eduvault_theme', 'dark');
      document.getElementById('sun-icon')?.classList.remove('hidden');
      document.getElementById('moon-icon')?.classList.add('hidden');
    }
  },

  /**
   * Load Exams from local JSON & localStorage additions
   */
  async loadExams() {
    try {
      const response = await fetch('./data/exams.json');
      if (response.ok) {
        this.exams = await response.json();
      } else {
        this.exams = [];
      }
    } catch (e) {
      console.warn('Could not fetch data/exams.json directly, falling back to local storage cache.', e);
      this.exams = [];
    }

    // Load any user-imported exams from LocalStorage
    const customExams = JSON.parse(localStorage.getItem('eduvault_custom_exams') || '[]');
    if (Array.isArray(customExams) && customExams.length > 0) {
      const existingIds = new Set(this.exams.map(e => e.id));
      customExams.forEach(item => {
        if (!existingIds.has(item.id)) {
          this.exams.push(item);
        }
      });
    }
  },

  /**
   * Re-render Lucide icons
   */
  initLucide() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  },

  /**
   * Render KaTeX formulas in an element
   */
  renderMath(element) {
    if (window.renderMathInElement && element) {
      renderMathInElement(element, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false },
          { left: '\\(', right: '\\)', display: false },
          { left: '\\[', right: '\\]', display: true }
        ],
        throwOnError: false
      });
    }
  },

  /**
   * Helper to render custom vector diagram or chemical structure
   */
  getDiagramHtml(q) {
    if (!q || !q.diagram) return '';
    return `
      <div class="diagram-container">
        ${q.diagram}
        ${q.diagramCaption ? `<span class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 text-center">${q.diagramCaption}</span>` : ''}
      </div>
    `;
  },

  /**
   * Dynamic Subject Filters
   */
  renderSubjectFilters() {
    const subjects = ['ALL', ...new Set(this.exams.map(e => e.subject).filter(Boolean))];
    const container = document.getElementById('subject-filters');
    if (!container) return;

    container.innerHTML = subjects.map(sub => {
      const isActive = this.activeSubject === sub;
      const label = sub === 'ALL' ? 'Tất cả môn' : sub;
      return `
        <button 
          onclick="app.selectSubject('${sub}')" 
          class="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            isActive 
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
              : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/60 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300'
          }"
        >
          ${label}
        </button>
      `;
    }).join('');
  },

  selectSubject(sub) {
    this.activeSubject = sub;
    this.renderSubjectFilters();
    this.renderExamsList();
  },

  handleGradeFilter() {
    const select = document.getElementById('grade-filter');
    this.activeGrade = select ? select.value : 'ALL';
    this.renderExamsList();
  },

  handleSearch() {
    const input = document.getElementById('search-input');
    this.searchQuery = (input ? input.value : '').trim().toLowerCase();
    this.renderExamsList();
  },

  /**
   * Render Exam Cards in Home View
   */
  renderExamsList() {
    const container = document.getElementById('exams-container');
    if (!container) return;

    let filtered = this.exams.filter(exam => {
      // Subject filter
      if (this.activeSubject !== 'ALL' && exam.subject !== this.activeSubject) return false;
      // Grade filter
      if (this.activeGrade !== 'ALL' && exam.grade !== this.activeGrade) return false;
      // Search keyword filter
      if (this.searchQuery) {
        const textToSearch = [
          exam.title,
          exam.subject,
          exam.grade,
          exam.description || '',
          (exam.tags || []).join(' ')
        ].join(' ').toLowerCase();
        if (!textToSearch.includes(this.searchQuery)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-16 text-center space-y-3">
          <div class="w-16 h-16 mx-auto rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
            <i data-lucide="file-question" class="w-8 h-8"></i>
          </div>
          <p class="font-bold text-slate-700 dark:text-slate-300">Không tìm thấy đề thi phù hợp</p>
          <p class="text-xs text-slate-400">Hãy thử tìm từ khóa khác hoặc bấm nút "Nhập Đề Nhanh" để nạp đề mới.</p>
        </div>
      `;
      this.initLucide();
      return;
    }

    container.innerHTML = filtered.map(exam => {
      const qCount = (exam.questions || []).length;
      const duration = exam.durationMinutes || 45;
      const tags = (exam.tags || []).slice(0, 3).map(t => `<span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 font-medium">#${t}</span>`).join('');

      return `
        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">
          <div class="space-y-4">
            <!-- Badges -->
            <div class="flex items-center justify-between gap-2">
              <span class="px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                ${exam.subject}
              </span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                ${exam.grade || 'THPT'}
              </span>
            </div>

            <!-- Title -->
            <h3 class="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">
              ${exam.title}
            </h3>

            <!-- Description -->
            <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
              ${exam.description || 'Bộ đề thi chọn lọc nội dung bài thi, lược bỏ thông tin rườm rà, tập trung luyện tập.'}
            </p>

            <!-- Meta statistics -->
            <div class="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/50">
              <div class="flex items-center gap-1.5">
                <i data-lucide="help-circle" class="w-4 h-4 text-slate-400"></i>
                <span>${qCount} câu hỏi</span>
              </div>
              <div class="flex items-center gap-1.5">
                <i data-lucide="clock" class="w-4 h-4 text-slate-400"></i>
                <span>${duration} phút</span>
              </div>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-1 pt-1">
              ${tags}
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/60">
            <button 
              onclick="app.openReader('${exam.id}')" 
              class="px-2 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1"
              title="Xem và tải đề thi"
            >
              <i data-lucide="file-text" class="w-3.5 h-3.5"></i>
              <span>Xem Đề</span>
            </button>

            <button 
              onclick="app.startPractice('${exam.id}')" 
              class="px-2 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 flex items-center justify-center gap-1"
              title="Ôn tập có giải thích tức thì"
            >
              <i data-lucide="zap" class="w-3.5 h-3.5"></i>
              <span>Ôn Tập</span>
            </button>

            <button 
              onclick="app.startExam('${exam.id}')" 
              class="px-2 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center justify-center gap-1"
              title="Thi thử có bấm giờ"
            >
              <i data-lucide="play" class="w-3.5 h-3.5"></i>
              <span>Thi Thử</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.initLucide();
  },

  /**
   * Switch Active View Screen
   */
  showView(viewId) {
    this.currentMode = viewId;
    ['view-home', 'view-reader', 'view-exam', 'view-practice', 'view-result'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (id === viewId) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      }
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  showHome() {
    this.clearIntervals();
    this.showView('view-home');
  },

  /**
   * ----------------------------------------------------
   * VIEW: READER & DOWNLOADER
   * ----------------------------------------------------
   */
  openReader(examId) {
    this.currentExam = this.exams.find(e => e.id === examId);
    if (!this.currentExam) return;

    this.readerShowAnswers = false;
    document.getElementById('toggle-answers-text').textContent = 'Hiện Đáp Án';

    document.getElementById('reader-title').textContent = this.currentExam.title;
    document.getElementById('reader-meta').innerHTML = `
      <span>${this.currentExam.subject}</span> • 
      <span>${this.currentExam.grade}</span> • 
      <span>${(this.currentExam.questions || []).length} câu hỏi</span> • 
      <span>Thời gian: ${this.currentExam.durationMinutes || 45} phút</span>
    `;

    document.getElementById('print-exam-title').textContent = this.currentExam.title;
    document.getElementById('print-exam-meta').textContent = `Môn: ${this.currentExam.subject} | ${this.currentExam.grade} | Số câu: ${(this.currentExam.questions || []).length} | Thời gian: ${this.currentExam.durationMinutes || 45} phút`;

    this.renderReaderQuestions();
    this.showView('view-reader');
  },

  toggleReaderAnswers() {
    this.readerShowAnswers = !this.readerShowAnswers;
    document.getElementById('toggle-answers-text').textContent = this.readerShowAnswers ? 'Ẩn Đáp Án' : 'Hiện Đáp Án';
    this.renderReaderQuestions();
  },

  renderReaderQuestions() {
    const container = document.getElementById('reader-questions');
    if (!container || !this.currentExam) return;

    container.innerHTML = (this.currentExam.questions || []).map((q, idx) => {
      const letters = ['A', 'B', 'C', 'D'];
      const optionsHtml = (q.options || []).map((opt, optIdx) => {
        const isCorrect = this.readerShowAnswers && q.correct === optIdx;
        const letter = letters[optIdx] || '';
        return `
          <div class="option-item p-3 rounded-xl border text-sm transition-all ${
            isCorrect 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 dark:border-emerald-500 font-semibold text-emerald-800 dark:text-emerald-200' 
              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
          }">
            <div class="flex items-start gap-2">
              <span class="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs ${
                isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }">${letter}</span>
              <div class="flex-1">${opt.replace(/^[A-D]\.\s*/, '')}</div>
            </div>
          </div>
        `;
      }).join('');

      const explanationHtml = (this.readerShowAnswers && q.explanation) ? `
        <div class="mt-3 p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-xs text-slate-700 dark:text-slate-200 space-y-1">
          <div class="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
            <i data-lucide="info" class="w-3.5 h-3.5"></i> Lời giải chi tiết:
          </div>
          <div class="leading-relaxed pl-5">${q.explanation}</div>
        </div>
      ` : '';

      return `
        <div class="question-card bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-start gap-3">
            <span class="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-extrabold text-xs shrink-0">
              Câu ${idx + 1}
            </span>
            <div class="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed flex-1">
              ${q.question}
            </div>
          </div>

          ${this.getDiagramHtml(q)}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            ${optionsHtml}
          </div>

          ${explanationHtml}
        </div>
      `;
    }).join('');

    this.renderMath(container);
    this.initLucide();
  },

  downloadExamJson() {
    if (!this.currentExam) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(this.currentExam, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `${this.currentExam.id || 'de-thi'}.json`);
    dlAnchorElem.click();
  },

  downloadExamText() {
    if (!this.currentExam) return;
    let content = `BÀI THI: ${this.currentExam.title}\n`;
    content += `Môn: ${this.currentExam.subject} | ${this.currentExam.grade} | Thời gian: ${this.currentExam.durationMinutes || 45} phút\n`;
    content += `----------------------------------------------------\n\n`;

    (this.currentExam.questions || []).forEach((q, idx) => {
      content += `Câu ${idx + 1}: ${q.question}\n`;
      (q.options || []).forEach((opt, oIdx) => {
        content += `  ${opt}\n`;
      });
      content += `\n`;
    });

    content += `\n----------------- ĐÁP ÁN THAM KHẢO -----------------\n`;
    const letters = ['A', 'B', 'C', 'D'];
    (this.currentExam.questions || []).forEach((q, idx) => {
      content += `Câu ${idx + 1}: ${letters[q.correct] || 'Chưa có'}\n`;
      if (q.explanation) {
        content += `  Lời giải: ${q.explanation}\n`;
      }
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${this.currentExam.id || 'de-thi'}.txt`;
    link.click();
  },

  startExamFromReader() {
    if (this.currentExam) {
      this.startExam(this.currentExam.id);
    }
  },

  /**
   * ----------------------------------------------------
   * VIEW: TIMED MOCK EXAM
   * ----------------------------------------------------
   */
  startExam(examId) {
    this.currentExam = this.exams.find(e => e.id === examId);
    if (!this.currentExam) return;

    this.clearIntervals();
    this.examUserAnswers = {};
    this.examFlaggedQuestions = {};
    this.examTotalSeconds = (this.currentExam.durationMinutes || 45) * 60;
    this.examSecondsRemaining = this.examTotalSeconds;

    document.getElementById('active-exam-title').textContent = this.currentExam.title;

    this.renderExamQuestions();
    this.renderExamPalette();
    this.startExamTimer();

    this.showView('view-exam');
  },

  startExamTimer() {
    this.updateTimerDisplay();
    this.examTimerInterval = setInterval(() => {
      this.examSecondsRemaining--;
      this.updateTimerDisplay();

      if (this.examSecondsRemaining <= 0) {
        this.clearIntervals();
        alert('Đã hết giờ làm bài! Hệ thống sẽ tự động nộp bài và chấm điểm.');
        this.finishExamNow();
      }
    }, 1000);
  },

  updateTimerDisplay() {
    const minutes = Math.floor(this.examSecondsRemaining / 60);
    const seconds = this.examSecondsRemaining % 60;
    const display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const el = document.getElementById('exam-timer-display');
    const box = document.getElementById('exam-timer-box');
    if (el) el.textContent = display;

    // Warning color when low on time (< 5 mins)
    if (box) {
      if (this.examSecondsRemaining < 300) {
        box.classList.add('border-amber-500', 'text-amber-600', 'dark:text-amber-400');
      } else {
        box.classList.remove('border-amber-500', 'text-amber-600', 'dark:text-amber-400');
      }
    }
  },

  clearIntervals() {
    if (this.examTimerInterval) {
      clearInterval(this.examTimerInterval);
      this.examTimerInterval = null;
    }
  },

  renderExamQuestions() {
    const container = document.getElementById('exam-questions-list');
    if (!container || !this.currentExam) return;

    const letters = ['A', 'B', 'C', 'D'];
    container.innerHTML = (this.currentExam.questions || []).map((q, idx) => {
      const qId = q.id || (idx + 1);
      const isFlagged = !!this.examFlaggedQuestions[qId];

      const optionsHtml = (q.options || []).map((opt, optIdx) => {
        const isSelected = this.examUserAnswers[qId] === optIdx;
        const letter = letters[optIdx] || '';
        return `
          <button 
            type="button" 
            onclick="app.selectExamAnswer(${qId}, ${optIdx})"
            class="option-btn text-left p-3.5 rounded-2xl border transition-all flex items-start gap-3 ${
              isSelected 
                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' 
                : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200'
            }"
          >
            <span class="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs ${
              isSelected ? 'bg-white text-blue-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }">${letter}</span>
            <div class="text-sm font-medium flex-1 pt-0.5">${opt.replace(/^[A-D]\.\s*/, '')}</div>
          </button>
        `;
      }).join('');

      return `
        <div id="exam-q-${qId}" class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-start gap-3">
              <span class="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-extrabold text-xs shrink-0">
                Câu ${idx + 1}
              </span>
              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                ${q.question}
              </div>
            </div>

            <!-- Flag Question button -->
            <button 
              type="button"
              onclick="app.toggleFlagQuestion(${qId})" 
              class="shrink-0 p-2 rounded-xl border text-xs font-semibold transition-all ${
                isFlagged 
                  ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800' 
                  : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-amber-500'
              }"
              title="Đánh dấu phân vân / xem lại sau"
            >
              <i data-lucide="bookmark" class="w-4 h-4 ${isFlagged ? 'fill-current' : ''}"></i>
            </button>
          </div>

          ${this.getDiagramHtml(q)}

          <!-- Options 2 columns -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            ${optionsHtml}
          </div>
        </div>
      `;
    }).join('');

    this.renderMath(container);
    this.initLucide();
  },

  selectExamAnswer(qId, optIdx) {
    this.examUserAnswers[qId] = optIdx;
    this.renderExamQuestions();
    this.renderExamPalette();
  },

  toggleFlagQuestion(qId) {
    this.examFlaggedQuestions[qId] = !this.examFlaggedQuestions[qId];
    this.renderExamQuestions();
    this.renderExamPalette();
  },

  renderExamPalette() {
    const grid = document.getElementById('palette-grid');
    const progressEl = document.getElementById('palette-progress');
    if (!grid || !this.currentExam) return;

    const questions = this.currentExam.questions || [];
    let answeredCount = 0;

    grid.innerHTML = questions.map((q, idx) => {
      const qId = q.id || (idx + 1);
      const isAnswered = this.examUserAnswers[qId] !== undefined;
      const isFlagged = !!this.examFlaggedQuestions[qId];

      if (isAnswered) answeredCount++;

      let bgClass = 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200';
      if (isAnswered) {
        bgClass = 'bg-blue-600 text-white font-bold hover:bg-blue-700';
      }
      if (isFlagged) {
        bgClass = 'bg-amber-400 text-amber-950 font-bold hover:bg-amber-500 ring-2 ring-amber-300';
      }

      return `
        <button 
          onclick="app.scrollToExamQuestion(${qId})" 
          class="w-full aspect-square rounded-xl text-xs flex items-center justify-center transition-all ${bgClass}"
        >
          ${idx + 1}
        </button>
      `;
    }).join('');

    if (progressEl) {
      progressEl.textContent = `${answeredCount}/${questions.length} Đã chọn`;
    }
  },

  scrollToExamQuestion(qId) {
    const el = document.getElementById(`exam-q-${qId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  confirmSubmitExam() {
    const total = (this.currentExam.questions || []).length;
    const answered = Object.keys(this.examUserAnswers).length;
    const unAnswered = total - answered;

    const msg = unAnswered > 0 
      ? `Bạn còn ${unAnswered} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài ngay bây giờ?` 
      : `Bạn đã hoàn thành đủ ${total}/${total} câu hỏi. Bạn có muốn nộp bài và chấm điểm?`;

    document.getElementById('submit-confirm-msg').textContent = msg;
    const modal = document.getElementById('submit-confirm-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeSubmitModal() {
    const modal = document.getElementById('submit-confirm-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  finishExamNow() {
    this.closeSubmitModal();
    this.clearIntervals();

    // Grade the exam
    const questions = this.currentExam.questions || [];
    const totalQ = questions.length;
    let correctCount = 0;

    const detailedReview = questions.map((q, idx) => {
      const qId = q.id || (idx + 1);
      const userChoice = this.examUserAnswers[qId];
      const isCorrect = userChoice === q.correct;
      if (isCorrect) correctCount++;

      return {
        questionNumber: idx + 1,
        question: q.question,
        options: q.options,
        userChoice,
        correctChoice: q.correct,
        isCorrect,
        explanation: q.explanation,
        diagram: q.diagram,
        diagramCaption: q.diagramCaption
      };
    });

    const timeSpentSeconds = this.examTotalSeconds - Math.max(0, this.examSecondsRemaining);
    const score = totalQ > 0 ? ((correctCount / totalQ) * 10).toFixed(1) : 0;
    const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;

    this.lastExamResult = {
      examTitle: this.currentExam.title,
      score,
      correctCount,
      totalCount: totalQ,
      accuracy,
      timeSpentSeconds,
      detailedReview
    };

    this.renderResultScreen();
  },

  /**
   * ----------------------------------------------------
   * VIEW: EXAM RESULT SUMMARY
   * ----------------------------------------------------
   */
  renderResultScreen() {
    if (!this.lastExamResult) return;

    const res = this.lastExamResult;
    document.getElementById('result-exam-name').textContent = res.examTitle;
    document.getElementById('result-score').textContent = res.score;
    document.getElementById('result-correct-count').textContent = `${res.correctCount}/${res.totalCount}`;
    document.getElementById('result-accuracy').textContent = `${res.accuracy}%`;

    const mins = Math.floor(res.timeSpentSeconds / 60);
    const secs = res.timeSpentSeconds % 60;
    document.getElementById('result-time-spent').textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const container = document.getElementById('result-breakdown');
    if (container) {
      const letters = ['A', 'B', 'C', 'D'];
      container.innerHTML = res.detailedReview.map(item => {
        const userLetter = item.userChoice !== undefined ? letters[item.userChoice] : 'Chưa chọn';
        const correctLetter = letters[item.correctChoice] || '';

        const badgeHtml = item.isCorrect 
          ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">ĐÚNG</span>`
          : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">SAI</span>`;

        const optionsHtml = (item.options || []).map((opt, optIdx) => {
          const isUser = item.userChoice === optIdx;
          const isReal = item.correctChoice === optIdx;

          let colorClass = 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';
          if (isReal) {
            colorClass = 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 font-semibold text-emerald-800 dark:text-emerald-200';
          } else if (isUser && !item.isCorrect) {
            colorClass = 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 font-semibold text-rose-800 dark:text-rose-200';
          }

          return `
            <div class="p-3 rounded-xl border text-xs sm:text-sm flex items-start gap-2 ${colorClass}">
              <span class="w-5 h-5 rounded flex items-center justify-center font-bold text-xs shrink-0 ${
                isReal ? 'bg-emerald-600 text-white' : (isUser ? 'bg-rose-600 text-white' : 'bg-slate-200 dark:bg-slate-700')
              }">${letters[optIdx]}</span>
              <div>${opt.replace(/^[A-D]\.\s*/, '')}</div>
            </div>
          `;
        }).join('');

        return `
          <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-start gap-3">
                <span class="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs shrink-0">
                  Câu ${item.questionNumber}
                </span>
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                  ${item.question}
                </div>
              </div>
              <div>${badgeHtml}</div>
            </div>

            ${this.getDiagramHtml(item)}

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              ${optionsHtml}
            </div>

            <div class="flex items-center gap-4 text-xs font-medium text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-700/60">
              <div>Bạn chọn: <strong class="${item.isCorrect ? 'text-emerald-600' : 'text-rose-600'}">${userLetter}</strong></div>
              <div>Đáp án đúng: <strong class="text-emerald-600">${correctLetter}</strong></div>
            </div>

            ${item.explanation ? `
              <div class="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-slate-700 dark:text-slate-200">
                <strong class="text-blue-700 dark:text-blue-300">Lời giải chi tiết:</strong> ${item.explanation}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');

      this.renderMath(container);
    }

    this.showView('view-result');
    this.initLucide();
  },

  retryExam() {
    if (this.currentExam) {
      this.startExam(this.currentExam.id);
    }
  },

  /**
   * ----------------------------------------------------
   * VIEW: PRACTICE MODE (ÔN TẬP NHANH)
   * ----------------------------------------------------
   */
  startPractice(examId) {
    this.currentExam = this.exams.find(e => e.id === examId);
    if (!this.currentExam) return;

    this.practiceAnswers = {};
    document.getElementById('practice-title').textContent = this.currentExam.title;

    this.renderPracticeQuestions();
    this.showView('view-practice');
  },

  resetPractice() {
    this.practiceAnswers = {};
    this.renderPracticeQuestions();
  },

  renderPracticeQuestions() {
    const container = document.getElementById('practice-questions-list');
    if (!container || !this.currentExam) return;

    const letters = ['A', 'B', 'C', 'D'];
    container.innerHTML = (this.currentExam.questions || []).map((q, idx) => {
      const qId = q.id || (idx + 1);
      const state = this.practiceAnswers[qId];

      const optionsHtml = (q.options || []).map((opt, optIdx) => {
        const letter = letters[optIdx] || '';
        let btnClass = 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300';

        if (state) {
          if (optIdx === q.correct) {
            btnClass = 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 font-bold text-emerald-800 dark:text-emerald-200 ring-2 ring-emerald-400';
          } else if (state.selected === optIdx && !state.isCorrect) {
            btnClass = 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 font-bold text-rose-800 dark:text-rose-200';
          }
        }

        return `
          <button 
            type="button" 
            onclick="app.handlePracticeSelect(${qId}, ${optIdx})"
            class="text-left p-3.5 rounded-2xl border text-sm transition-all flex items-start gap-3 ${btnClass}"
          >
            <span class="w-6 h-6 shrink-0 rounded-lg flex items-center justify-center font-bold text-xs ${
              state && optIdx === q.correct ? 'bg-emerald-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
            }">${letter}</span>
            <div class="flex-1 font-medium pt-0.5">${opt.replace(/^[A-D]\.\s*/, '')}</div>
          </button>
        `;
      }).join('');

      const feedbackHtml = state ? `
        <div class="mt-4 p-4 rounded-2xl border ${
          state.isCorrect 
            ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
            : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800'
        } space-y-2">
          <div class="font-bold text-sm flex items-center gap-2 ${state.isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'}">
            <i data-lucide="${state.isCorrect ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i>
            <span>${state.isCorrect ? 'Chính xác!' : 'Chưa chính xác! Hãy đọc lời giải bên dưới:'}</span>
          </div>
          ${q.explanation ? `
            <div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed pl-6">
              ${q.explanation}
            </div>
          ` : ''}
        </div>
      ` : '';

      return `
        <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">
          <div class="flex items-start gap-3">
            <span class="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs shrink-0">
              Câu ${idx + 1}
            </span>
            <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
              ${q.question}
            </div>
          </div>

          ${this.getDiagramHtml(q)}

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            ${optionsHtml}
          </div>

          ${feedbackHtml}
        </div>
      `;
    }).join('');

    this.renderMath(container);
    this.initLucide();
  },

  handlePracticeSelect(qId, optIdx) {
    if (!this.currentExam) return;
    const q = (this.currentExam.questions || []).find(x => (x.id || 0) === qId);
    if (!q) return;

    this.practiceAnswers[qId] = {
      selected: optIdx,
      isCorrect: optIdx === q.correct
    };

    this.renderPracticeQuestions();
  },

  /**
   * ----------------------------------------------------
   * IMPORT MODAL & QUICK DATA INGESTION
   * ----------------------------------------------------
   */
  openImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  },

  closeImportModal() {
    const modal = document.getElementById('import-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  },

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      document.getElementById('import-json-input').value = e.target.result;
    };
    reader.readAsText(file);
  },

  saveImportedExam() {
    const raw = document.getElementById('import-json-input').value.trim();
    if (!raw) {
      alert('Vui lòng dán mã JSON đề thi hoặc chọn file!');
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const newExams = Array.isArray(parsed) ? parsed : [parsed];

      let saved = JSON.parse(localStorage.getItem('eduvault_custom_exams') || '[]');
      newExams.forEach(item => {
        if (!item.id) item.id = 'exam-' + Date.now();
        // Remove existing if matching id
        saved = saved.filter(e => e.id !== item.id);
        saved.unshift(item);

        // Update runtime exams
        this.exams = this.exams.filter(e => e.id !== item.id);
        this.exams.unshift(item);
      });

      localStorage.setItem('eduvault_custom_exams', JSON.stringify(saved));
      alert(`Đã nạp thành công ${newExams.length} đề thi mới!`);
      this.closeImportModal();
      document.getElementById('import-json-input').value = '';
      this.renderSubjectFilters();
      this.renderExamsList();
    } catch (err) {
      alert('Mã JSON không hợp lệ! Vui lòng kiểm tra lại định dạng JSON.');
      console.error(err);
    }
  }
};

// Start application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  app.init();
});
