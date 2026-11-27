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



  // Active Filters & State

  activeSource: 'ALL', // 'ALL' | 'OLM' | 'SCHOOL'

  activeSubject: 'ALL',

  activeTeacher: 'ALL',

  activeDuration: 'ALL',

  activeGrade: 'ALL',

  searchQuery: '',



  /**

   * Initialize App

   */

  async init() {

    this.initTheme();

    await this.loadExams();

    this.renderTeacherFilter();

    this.renderSubjectFilters();

    this.updateTabCounts();

    this.setSourceTab('ALL');

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

      const response = await fetch('./data/exams.json?v=' + Date.now(), { cache: 'no-store' });

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

   * Render KaTeX formulas in an element with retry mechanism

   */

  renderMath(element) {

    if (!element) return;

    const run = () => {

      if (window.renderMathInElement) {

        try {

          renderMathInElement(element, {

            delimiters: [

              { left: '$$', right: '$$', display: true },

              { left: '$', right: '$', display: false },

              { left: '\\(', right: '\\)', display: false },

              { left: '\\[', right: '\\]', display: true }

            ],

            throwOnError: false,

            ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code']

          });

        } catch (e) {

          console.warn('KaTeX render warning:', e);

        }

      }

    };



    if (window.renderMathInElement) {

      run();

    } else {

      setTimeout(run, 150);

      setTimeout(run, 500);

    }

  },



  /**

   * Helper to clean True/False item text from leftover .( T ), .( F ), ( T ), ( F ) markers

   */

  cleanItemText(text) {

    if (!text) return '';

    return String(text)

      .replace(/\s*\.?\s*\(\s*[TFtf]\s*\)\s*$/g, '')

      .replace(/\s*\.?\s*\(\s*(True|False|Đúng|Sai)\s*\)\s*$/gi, '')

      .trim();

  },



  /**

   * Helper to determine if a True/False sub-item is correct with multi-tier heuristic

   */

  isItemCorrect(item) {

    if (!item) return false;

    if (item.correct === true) return true;

    const rawText = String(item.text || '');

    if (/\(\s*[Tt]\s*\)|\(\s*True\s*\)|\.\(\s*[Tt]\s*\)/i.test(rawText)) {

      return true;

    }

    if (item.explanation && /^(?:[a-d]\s*[\)\.]\s*)?Đúng/i.test(item.explanation.trim())) {

      return true;

    }

    return false;

  },



  /**

   * Helper to render custom vector diagram or chemical structure

   */

  

  /**

   * Helper to render shared passage / reading context box

   */

  getPassageHtml(q, prevQ) {

    if (!q || !q.passage) return '';

    const p = q.passage;

    const prevP = prevQ ? prevQ.passage : null;

    

    // If same passage as previous question, do not re-render

    if (prevP && ((p.id && prevP.id === p.id) || (p.title && prevP.title === p.title))) {

      return '';

    }



    return `

      <div class="passage-container my-6 p-5 sm:p-6 rounded-3xl bg-slate-50 dark:bg-slate-900/90 border-2 border-blue-200 dark:border-blue-900/60 shadow-sm space-y-4">

        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200/80 dark:border-blue-800/80 pb-3">

          <div class="flex items-center gap-2 text-blue-700 dark:text-blue-300 font-bold text-xs uppercase tracking-wider">

            <i data-lucide="book-open" class="w-4 h-4 shrink-0"></i>

            <span>${p.title || 'NGỮ LIỆU ĐỌC DÙNG CHUNG'}</span>

          </div>

          ${p.range ? `<span class="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-extrabold text-xs shadow-sm">${p.range}</span>` : ''}

        </div>

        ${p.instruction ? `<div class="text-xs text-slate-600 dark:text-slate-400 font-medium italic">${p.instruction}</div>` : ''}

        <div class="text-sm font-normal text-slate-800 dark:text-slate-200 leading-relaxed font-sans bg-white dark:bg-slate-800/90 p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-inner overflow-x-auto">

          ${p.content}

        </div>

      </div>

    `;

  },



  getDiagramHtml(q) {
    if (!q) return '';
    const parts = [];
    if (q.diagram) {
      parts.push(`
        <div class="diagram-container">
          ${q.diagram}
          ${q.diagramCaption ? `<span class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-2 text-center">${q.diagramCaption}</span>` : ''}
        </div>
      `);
    }
    const imgList = [];
    if (Array.isArray(q.images)) {
      q.images.forEach(u => { if (u && typeof u === 'string' && !imgList.includes(u)) imgList.push(u); });
    }
    if (q.image && typeof q.image === 'string' && !imgList.includes(q.image)) {
      imgList.push(q.image);
    }
    if (imgList.length > 0) {
      const imgsHtml = imgList.map((src, idx) => `
        <a href="${src}" target="_blank" rel="noopener noreferrer" class="block group" title="Nhấp để xem ảnh lớn">
          <img src="${src}" alt="Hình minh họa ${idx + 1}" loading="lazy"
            class="max-h-80 w-auto max-w-full mx-auto rounded-2xl bg-white p-2 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform duration-200 group-hover:scale-[1.01] object-contain" />
        </a>
      `).join('');
      parts.push(`
        <div class="question-images my-4 flex flex-wrap items-center justify-center gap-3">
          ${imgsHtml}
        </div>
      `);
    }
    return parts.join('');
  },



  /**

   * Helper to identify OLM exams

   */

  isOlmExam(exam) {

    if (!exam) return false;

    if (exam.source && exam.source.toUpperCase() === 'OLM') return true;

    if (exam.id && exam.id.toLowerCase().startsWith('olm-')) return true;

    if (exam.title && exam.title.toLowerCase().includes('olm')) return true;

    return false;

  },



  /**

   * Helper to format teacher name

   */

  getExamTeacher(exam) {

    if (!exam) return 'Ban Chuyên Môn';

    if (exam.teacher && exam.teacher.trim()) return exam.teacher.trim();

    if (exam.author && exam.author.trim()) return exam.author.trim();

    return this.isOlmExam(exam) ? 'Ban Cố Vấn OLM' : 'Tổ Chuyên Môn';

  },



  /**

   * Source Tab Switching ([Tất cả] | [Kho Đề OLM] | [Đề Trường Học])

   */

  setSourceTab(source) {

    this.activeSource = source;

    

    const tabs = [

      { id: 'tab-source-all', key: 'ALL', activeClass: 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' },

      { id: 'tab-source-olm', key: 'OLM', activeClass: 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-sm' },

      { id: 'tab-source-school', key: 'SCHOOL', activeClass: 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' }

    ];



    tabs.forEach(t => {

      const el = document.getElementById(t.id);

      if (!el) return;

      if (t.key === source) {

        el.className = `source-tab flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all ${t.activeClass}`;

      } else {

        el.className = 'source-tab flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';

      }

    });



    this.renderExamsList();

  },



  /**

   * Update badge counters on Source tabs

   */

  updateTabCounts() {

    const total = this.exams.length;

    const olmCount = this.exams.filter(e => this.isOlmExam(e)).length;

    const schoolCount = total - olmCount;



    const bAll = document.getElementById('badge-count-all');

    const bOlm = document.getElementById('badge-count-olm');

    const bSchool = document.getElementById('badge-count-school');



    if (bAll) bAll.textContent = total;

    if (bOlm) bOlm.textContent = olmCount;

    if (bSchool) bSchool.textContent = schoolCount;

  },



  /**

   * Dynamic Subject Filters (Dropdown & Quick Pills)

   */

  renderSubjectFilters() {

    const subjects = ['ALL', ...new Set(this.exams.map(e => (e.subject || '').trim()).filter(Boolean))].sort();

    

    // 1. Update Dropdown

    const select = document.getElementById('subject-filter');

    if (select) {

      select.innerHTML = subjects.map(sub => {

        const sel = this.activeSubject === sub ? 'selected' : '';

        const label = sub === 'ALL' ? 'Tất cả môn học' : sub;

        return `<option value="${sub}" ${sel}>${label}</option>`;

      }).join('');

    }



    // 2. Update Quick pills

    const container = document.getElementById('subject-filters');

    if (container) {

      container.innerHTML = subjects.map(sub => {

        const isActive = this.activeSubject === sub;

        const label = sub === 'ALL' ? 'Tất cả môn' : sub;

        return `

          <button 

            type="button"

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

    }

  },



  /**

   * Dynamic Teacher Filter (Dropdown)

   */

  renderTeacherFilter() {

    const select = document.getElementById('teacher-filter');

    if (!select) return;



    const teacherSet = new Set();

    this.exams.forEach(e => {

      const t = (e.teacher || e.author || '').trim();

      if (t) teacherSet.add(t);

    });



    const teachers = [...teacherSet].sort();

    let html = '<option value="ALL">Tất cả giáo viên</option>';

    teachers.forEach(t => {

      const sel = this.activeTeacher === t ? 'selected' : '';

      html += `<option value="${t}" ${sel}>${t}</option>`;

    });



    const hasUnassigned = this.exams.some(e => !(e.teacher || e.author || '').trim());

    if (hasUnassigned && teachers.length > 0) {

      const sel = this.activeTeacher === 'OTHER' ? 'selected' : '';

      html += `<option value="OTHER" ${sel}>Tổ bộ môn / Chưa ghi GV</option>`;

    }



    select.innerHTML = html;

  },



  handleSubjectDropdown(val) {

    this.activeSubject = val;

    this.renderSubjectFilters();

    this.renderExamsList();

  },



  selectSubject(sub) {

    this.activeSubject = sub;

    const select = document.getElementById('subject-filter');

    if (select) select.value = sub;

    this.renderSubjectFilters();

    this.renderExamsList();

  },



  handleTeacherDropdown(val) {

    this.activeTeacher = val;

    this.renderExamsList();

  },



  handleDurationDropdown(val) {

    this.activeDuration = val;

    this.renderExamsList();

  },



  handleGradeFilter() {

    const select = document.getElementById('grade-filter');

    this.activeGrade = select ? select.value : 'ALL';

    this.renderExamsList();

  },



  handleSearch() {

    const input = document.getElementById('search-input');

    const clearBtn = document.getElementById('search-clear-btn');

    this.searchQuery = (input ? input.value : '').trim().toLowerCase();

    if (clearBtn) {

      if (this.searchQuery) {

        clearBtn.classList.remove('hidden');

      } else {

        clearBtn.classList.add('hidden');

      }

    }

    this.renderExamsList();

  },



  clearSearch() {

    const input = document.getElementById('search-input');

    if (input) input.value = '';

    this.handleSearch();

  },



  resetAllFilters() {

    this.activeSource = 'ALL';

    this.activeSubject = 'ALL';

    this.activeTeacher = 'ALL';

    this.activeDuration = 'ALL';

    this.activeGrade = 'ALL';

    this.searchQuery = '';



    const searchInput = document.getElementById('search-input');

    if (searchInput) searchInput.value = '';



    const subSelect = document.getElementById('subject-filter');

    if (subSelect) subSelect.value = 'ALL';



    const teachSelect = document.getElementById('teacher-filter');

    if (teachSelect) teachSelect.value = 'ALL';



    const durSelect = document.getElementById('duration-filter');

    if (durSelect) durSelect.value = 'ALL';



    const gradeSelect = document.getElementById('grade-filter');

    if (gradeSelect) gradeSelect.value = 'ALL';



    this.setSourceTab('ALL');

    this.renderSubjectFilters();

    this.renderTeacherFilter();

    this.renderExamsList();

  },



  /**

   * Render Exam Cards in Home View

   */

  renderExamsList() {

    const container = document.getElementById('exams-container');

    if (!container) return;



    this.updateTabCounts();



    let filtered = this.exams.filter(exam => {

      // 1. Source Tab Filter

      if (this.activeSource !== 'ALL') {

        const isOlm = this.isOlmExam(exam);

        if (this.activeSource === 'OLM' && !isOlm) return false;

        if (this.activeSource === 'SCHOOL' && isOlm) return false;

      }



      // 2. Subject filter

      if (this.activeSubject !== 'ALL' && exam.subject !== this.activeSubject) return false;



      // 3. Teacher filter

      if (this.activeTeacher !== 'ALL') {

        const t = (exam.teacher || exam.author || '').trim();

        if (this.activeTeacher === 'OTHER') {

          if (t) return false;

        } else {

          if (t !== this.activeTeacher) return false;

        }

      }



      // 4. Duration filter

      if (this.activeDuration !== 'ALL') {

        const dur = Number(exam.durationMinutes) || 45;

        if (this.activeDuration === '15') {

          if (dur > 20) return false;

        } else if (this.activeDuration === '45') {

          if (dur < 25 || dur > 50) return false;

        } else if (this.activeDuration === '60') {

          if (dur < 55 || dur > 75) return false;

        } else if (this.activeDuration === '90') {

          if (dur < 80) return false;

        } else if (dur !== Number(this.activeDuration)) {

          return false;

        }

      }



      // 5. Grade filter

      if (this.activeGrade !== 'ALL' && exam.grade !== this.activeGrade) return false;



      // 6. Search keyword filter

      if (this.searchQuery) {

        const textToSearch = [

          exam.title,

          exam.subject,

          exam.grade,

          exam.teacher || '',

          exam.author || '',

          exam.description || '',

          (exam.tags || []).join(' ')

        ].join(' ').toLowerCase();

        if (!textToSearch.includes(this.searchQuery)) return false;

      }

      return true;

    });



    const statusEl = document.getElementById('filtered-exams-status');

    if (statusEl) {

      statusEl.textContent = `Hiển thị ${filtered.length}/${this.exams.length} đề thi`;

    }



    if (filtered.length === 0) {

      container.innerHTML = `

        <div class="col-span-full py-16 text-center space-y-3 bg-white dark:bg-slate-800/60 rounded-3xl border border-slate-200 dark:border-slate-700/60 p-8">

          <div class="w-16 h-16 mx-auto rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-400">

            <i data-lucide="file-question" class="w-8 h-8"></i>

          </div>

          <p class="font-bold text-base text-slate-700 dark:text-slate-300">Không tìm thấy đề thi phù hợp</p>

          <p class="text-xs text-slate-400 max-w-sm mx-auto">Không có đề nào khớp với các bộ lọc bạn đang chọn. Hãy thử xóa bộ lọc hoặc tìm từ khóa khác.</p>

          <div class="pt-2">

            <button onclick="app.resetAllFilters()" class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm inline-flex items-center gap-1.5 transition-all">

              <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>

              <span>Đặt lại bộ lọc</span>

            </button>

          </div>

        </div>

      `;

      this.initLucide();

      return;

    }



    container.innerHTML = filtered.map(exam => {

      const qCount = (exam.questions || []).length;

      const duration = exam.durationMinutes || 45;

      const isOlm = this.isOlmExam(exam);

      const teacherName = this.getExamTeacher(exam);

      const tags = (exam.tags || []).slice(0, 3).map(t => `<span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300 font-medium">#${t}</span>`).join('');



      // Stylish OLM badge vs School badge

      const sourceBadge = isOlm

        ? `

          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-sm shadow-orange-500/25">

            <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>

            <i data-lucide="zap" class="w-3.5 h-3.5 fill-current text-yellow-200"></i>

            <span>Kho Đề OLM</span>

          </span>

        `

        : `

          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800">

            <i data-lucide="graduation-cap" class="w-3.5 h-3.5 text-indigo-500"></i>

            <span>Đề Trường Học</span>

          </span>

        `;



      return `

        <div class="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-200 dark:border-slate-700/80 hover:border-blue-400 dark:hover:border-blue-500 shadow-sm hover:shadow-xl transition-all flex flex-col justify-between group">

          <div class="space-y-4">

            <!-- Badges -->

            <div class="flex items-center justify-between gap-2">

              <div class="flex items-center gap-1.5">

                <span class="px-2.5 py-1 rounded-xl text-xs font-extrabold bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">

                  ${exam.subject}

                </span>

                <span class="text-xs font-semibold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">

                  ${exam.grade || 'THPT'}

                </span>

              </div>

              ${sourceBadge}

            </div>



            <!-- Title -->

            <h3 class="font-bold text-base sm:text-lg text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors leading-snug line-clamp-2">

              ${exam.title}

            </h3>



            <!-- Teacher Name Tag -->

            <div class="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">

              <div class="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 shadow-sm">

                <i data-lucide="user-check" class="w-4 h-4"></i>

              </div>

              <div class="truncate flex-1">

                <span class="text-slate-400 text-[10px] block font-medium uppercase tracking-wider">Giáo viên / Biên soạn</span>

                <span class="font-bold text-slate-800 dark:text-slate-200 truncate block">${teacherName}</span>

              </div>

            </div>



            <!-- Description -->

            <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">

              ${exam.description || 'Bộ đề thi chọn lọc nội dung bài thi, lược bỏ thông tin rườm rà, tập trung luyện tập.'}

            </p>



            <!-- Meta statistics -->

            <div class="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-700/50">

              <div class="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-bold">

                <i data-lucide="clock" class="w-4 h-4 text-blue-500"></i>

                <span>${duration} phút</span>

              </div>

              <div class="flex items-center gap-1.5">

                <i data-lucide="help-circle" class="w-4 h-4 text-slate-400"></i>

                <span>${qCount} câu hỏi</span>

              </div>

            </div>



            <!-- Tags -->

            <div class="flex flex-wrap gap-1 pt-1">

              ${tags}

            </div>

          </div>



          <!-- Action Buttons -->

          <div class="space-y-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700/60">

            <!-- Direct 1-Click Download Word Button -->

            <button 

              type="button"

              onclick="app.downloadExamDocxById('${exam.id}', event)" 

              class="w-full py-2.5 px-3 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/70 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 shadow-sm flex items-center justify-center gap-1.5 transition-all group/dl hover:scale-[1.01]"

              title="Tải đề thi về máy dưới dạng Word chuẩn (.docx) mở tốt trên điện thoại & máy tính"

            >

              <i data-lucide="file-down" class="w-4 h-4 text-blue-600 dark:text-blue-400 group-hover/dl:-translate-y-0.5 transition-transform"></i>

              <span>Tải Đề Word (.docx)</span>

            </button>



            <!-- Secondary Actions: Xem Đề | Ôn Tập | Thi Thử -->

            <div class="grid grid-cols-3 gap-2">

              <button 

                type="button"

                onclick="app.openReader('${exam.id}')" 

                class="px-2 py-2 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1 transition-all"

                title="Xem đề trên web"

              >

                <i data-lucide="file-text" class="w-3.5 h-3.5"></i>

                <span>Xem Đề</span>

              </button>



              <button 

                type="button"

                onclick="app.startPractice('${exam.id}')" 

                class="px-2 py-2 rounded-xl text-xs font-semibold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 flex items-center justify-center gap-1 transition-all"

                title="Ôn tập có giải thích tức thì"

              >

                <i data-lucide="zap" class="w-3.5 h-3.5"></i>

                <span>Ôn Tập</span>

              </button>



              <button 

                type="button"

                onclick="app.startExam('${exam.id}')" 

                class="px-2 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 flex items-center justify-center gap-1 transition-all"

                title="Thi thử có bấm giờ"

              >

                <i data-lucide="play" class="w-3.5 h-3.5"></i>

                <span>Thi Thử</span>

              </button>

            </div>

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



    const isOlm = this.isOlmExam(this.currentExam);

    const teacherName = this.getExamTeacher(this.currentExam);

    const sourceLabel = isOlm ? 'Kho Đề OLM.VN' : 'Đề Trường Học';



    document.getElementById('reader-title').textContent = this.currentExam.title;

    document.getElementById('reader-meta').innerHTML = `

      <span class="font-bold text-blue-600 dark:text-blue-400">${this.currentExam.subject}</span> • 

      <span>${this.currentExam.grade}</span> • 

      <span class="inline-flex items-center gap-1 font-medium"><i data-lucide="user-check" class="w-3.5 h-3.5 text-indigo-500"></i> GV: ${teacherName}</span> • 

      <span>${(this.currentExam.questions || []).length} câu hỏi</span> • 

      <span>Thời gian: ${this.currentExam.durationMinutes || 45} phút</span> • 

      <span class="px-2 py-0.5 rounded-full text-[11px] font-bold ${isOlm ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300'}">${sourceLabel}</span>

    `;



    document.getElementById('print-exam-title').textContent = this.currentExam.title;

    document.getElementById('print-exam-meta').textContent = `Môn: ${this.currentExam.subject} | ${this.currentExam.grade} | GV: ${teacherName} | Nguồn: ${sourceLabel} | Số câu: ${(this.currentExam.questions || []).length} | Thời gian: ${this.currentExam.durationMinutes || 45} phút`;



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



    const questions = this.currentExam.questions || [];

    const letters = ['A', 'B', 'C', 'D'];



    container.innerHTML = questions.map((q, idx) => {

      const qId = q.id || (idx + 1);

      const prevQ = questions[idx - 1];

      const passageHtml = this.getPassageHtml(q, prevQ);



      const explanationHtml = (this.readerShowAnswers && q.explanation) ? `

        <div class="mt-3 p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 text-xs text-slate-700 dark:text-slate-200 space-y-1">

          <div class="font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5">

            <i data-lucide="info" class="w-3.5 h-3.5"></i> Lời giải chi tiết:

          </div>

          <div class="leading-relaxed pl-5">${q.explanation}</div>

        </div>

      ` : '';



      // CASE 1: True / False Group (GDPT 2018 format)

      if (q.type === 'true_false' && Array.isArray(q.items)) {

        const itemsHtml = q.items.map(item => {

          const isTrue = this.isItemCorrect(item);

          const badgeClass = isTrue ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20' : 'bg-rose-600 text-white shadow-sm shadow-rose-500/20';

          const badgeText = isTrue ? 'ĐÚNG' : 'SAI';

          const cleanText = this.cleanItemText(item.text);



          return `

            <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 space-y-2">

              <div class="flex items-start justify-between gap-3">

                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">

                  <span class="font-bold text-blue-600 dark:text-blue-400 mr-1.5">${item.label || ''})</span>

                  <span>${cleanText}</span>

                </div>

                ${this.readerShowAnswers ? `

                  <span class="px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeClass}">

                    ${badgeText}

                  </span>

                ` : ''}

              </div>

              ${this.readerShowAnswers && item.explanation ? `

                <div class="text-xs text-slate-600 dark:text-slate-400 pl-4 border-l-2 border-blue-400 dark:border-blue-500">

                  ${item.explanation}

                </div>

              ` : ''}

            </div>

          `;

        }).join('');



        return `

          ${passageHtml}

          <div class="question-card bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start gap-3">

              <span class="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-extrabold text-xs shrink-0">

                Câu ${idx + 1}

              </span>

              <div class="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed flex-1">

                ${q.question}

                <div class="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">Dạng trắc nghiệm Đúng / Sai (GDPT 2018)</div>

              </div>

            </div>



            ${this.getDiagramHtml(q)}



            <div class="space-y-2.5 pt-2">

              ${itemsHtml}

            </div>



            ${explanationHtml}

          </div>

        `;

      }



      // CASE 1B: Short Answer (Trả lời ngắn GDPT 2018)

      if (this.isShortAnswerQuestion(q)) {

        const expectedAns = this.getShortAnswerValue(q);

        return `

          ${passageHtml}

          <div class="question-card bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start gap-3">

              <span class="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-extrabold text-xs shrink-0">

                Câu ${idx + 1}

              </span>

              <div class="text-sm font-medium text-slate-900 dark:text-slate-100 leading-relaxed flex-1">

                ${q.question}

                <div class="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">Dạng Trả lời ngắn (Điền kết quả số / từ ngắn)</div>

              </div>

            </div>



            ${this.getDiagramHtml(q)}



            <div class="pt-2">

              ${this.readerShowAnswers ? `

                <div class="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-400 dark:border-emerald-600 text-emerald-800 dark:text-emerald-200 text-sm font-bold">

                  <i data-lucide="check-circle" class="w-4 h-4 text-emerald-600 dark:text-emerald-400"></i>

                  <span>Đáp án đúng: ${expectedAns || '—'}</span>

                </div>

              ` : `

                <div class="px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs italic">

                  Ô trả lời ngắn (bật "Hiện đáp án" để xem đáp số)

                </div>

              `}

            </div>



            ${explanationHtml}

          </div>

        `;

      }



      // CASE 2: Standard 4-choice questions

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



      return `

        ${passageHtml}

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



  /**

   * Direct 1-Click Download Word by Exam ID (from Home screen card)

   */

  /**

   * 1-Click Direct Download Word (.docx) by ID

   */

  async downloadExamDocxById(examId, event) {

    if (event) {

      if (typeof event.stopPropagation === 'function') event.stopPropagation();

      if (typeof event.preventDefault === 'function') event.preventDefault();

    }

    const exam = (this.exams || []).find(e => e && e.id === examId);

    if (!exam) {

      this.showToast('Không tìm thấy dữ liệu đề thi!', 'error');

      return;

    }

    await this.downloadExamDocx(exam);

  },



  downloadExamWordById(examId, event) {

    return this.downloadExamDocxById(examId, event);

  },



  /**

   * Universal Toast Notification System

   */

  showToast(message, type = 'info') {

    let container = document.getElementById('toast-container');

    if (!container) {

      container = document.createElement('div');

      container.id = 'toast-container';

      container.className = 'fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none';

      document.body.appendChild(container);

    }



    const toast = document.createElement('div');

    const bgClass = type === 'success' 

      ? 'bg-slate-900 dark:bg-slate-800 text-white border border-emerald-500/60 shadow-lg shadow-emerald-500/10' 

      : (type === 'error' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-slate-800 text-white');

    

    toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold transition-all transform duration-300 translate-y-3 opacity-0 ${bgClass}`;



    const iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-triangle' : 'info');

    toast.innerHTML = `

      <i data-lucide="${iconName}" class="w-4 h-4 shrink-0 ${type === 'success' ? 'text-emerald-400' : ''}"></i>

      <span class="truncate max-w-sm">${message}</span>

    `;



    container.appendChild(toast);

    this.initLucide();



    requestAnimationFrame(() => {

      toast.classList.remove('translate-y-3', 'opacity-0');

      toast.classList.add('translate-y-0', 'opacity-100');

    });



    setTimeout(() => {

      toast.classList.remove('translate-y-0', 'opacity-100');

      toast.classList.add('translate-y-3', 'opacity-0');

      setTimeout(() => {

        if (toast.parentNode) toast.parentNode.removeChild(toast);

      }, 300);

    }, 4000);

  },



  triggerBlobDownload(blob, filename) {

    const blobUrl = URL.createObjectURL(blob);

    const link = document.createElement('a');

    link.href = blobUrl;

    link.download = filename;

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

  },



  /**

   * Helper: Strip HTML and decode basic entities

   */

  stripHtml(html) {

    if (!html) return '';

    return String(html)

      .replace(/<br\s*\/?>/gi, '\n')

      .replace(/<[^>]+>/g, '')

      .replace(/&nbsp;/gi, ' ')

      .replace(/&amp;/gi, '&')

      .replace(/&lt;/gi, '<')

      .replace(/&gt;/gi, '>')

      .replace(/&quot;/gi, '"')

      .replace(/&#39;/gi, "'")

      .trim();

  },



  /**

   * Helper: Parse HTML into styled docx.TextRun objects

   */

  parseFormattedRuns(rawHtml, defaultSize = 26) {

    if (typeof docx === 'undefined') return [];

    if (!rawHtml) return [new docx.TextRun({ text: '', font: 'Times New Roman', size: defaultSize })];



    const text = String(rawHtml)

      .replace(/<br\s*\/?>/gi, '\n')

      .replace(/&nbsp;/gi, ' ')

      .replace(/&amp;/gi, '&')

      .replace(/&lt;/gi, '<')

      .replace(/&gt;/gi, '>')

      .replace(/&quot;/gi, '"')

      .replace(/&#39;/gi, "'");



    const regex = /(<\/?[a-z0-9]+[^>]*>|[^<]+)/gi;

    let match;

    let isBold = false;

    let isItalic = false;

    let isUnderline = false;

    const runs = [];



    while ((match = regex.exec(text)) !== null) {

      const part = match[0];

      if (part.startsWith('<')) {

        const tagMatch = part.match(/<\/?([a-z0-9]+)/i);

        if (tagMatch) {

          const tag = tagMatch[1].toLowerCase();

          const isClosing = part.startsWith('</');

          if (tag === 'b' || tag === 'strong') isBold = !isClosing;

          if (tag === 'i' || tag === 'em') isItalic = !isClosing;

          if (tag === 'u') isUnderline = !isClosing;

        }

      } else {

        if (part) {

          const lines = part.split('\n');

          for (let i = 0; i < lines.length; i++) {

            if (i > 0) runs.push(new docx.TextRun({ break: 1 }));

            if (lines[i]) {

              runs.push(new docx.TextRun({

                text: lines[i],

                font: 'Times New Roman',

                size: defaultSize,

                bold: isBold,

                italics: isItalic,

                underline: isUnderline ? { type: docx.UnderlineType.SINGLE } : undefined

              }));

            }

          }

        }

      }

    }



    return runs.length > 0 ? runs : [new docx.TextRun({ text: '', font: 'Times New Roman', size: defaultSize })];

  },



  /**

   * Build pure OpenXML .docx Document using docx.js

   */

  buildDocxDocument(exam) {

  const rawTitle = exam.title ? String(exam.title) : 'ĐỀ THI';

  const title = rawTitle.replace(/^OLM:\s*/i, '').trim() || 'Đề thi trắc nghiệm';

  const subject = exam.subject ? String(exam.subject).trim() : 'Chung';

  const grade = typeof exam.grade === 'number' ? ('Lớp ' + exam.grade) : String(exam.grade || 'Lớp 12');

  const questions = Array.isArray(exam.questions) ? exam.questions : [];



  const children = [];



  // Standard OLM Header

  children.push(new docx.Paragraph({

    spacing: { before: 0, after: 30 },

    children: [

      new docx.TextRun({ text: 'BÀI LUYỆN TẬP OLM', bold: true, color: '0000FF', font: 'Times New Roman', size: 24 })

    ]

  }));

  children.push(new docx.Paragraph({

    spacing: { before: 0, after: 30 },

    children: [

      new docx.TextRun({ text: `MÔN ${subject.toUpperCase()} ${grade.toUpperCase()}`, bold: true, color: '0000FF', font: 'Times New Roman', size: 24 })

    ]

  }));

  children.push(new docx.Paragraph({

    spacing: { before: 0, after: 60 },

    children: [

      new docx.TextRun({ text: `Bài học: ${title.toUpperCase()}`, bold: true, color: '0000FF', font: 'Times New Roman', size: 24 })

    ]

  }));



  // Student Info

  children.push(new docx.Paragraph({

    spacing: { before: 40, after: 30 },

    children: [

      new docx.TextRun({ text: 'Họ, tên: .....................................................................', font: 'Times New Roman', size: 24 }),

      new docx.TextRun({ text: 'Lớp: ..........................................................................', font: 'Times New Roman', size: 24 })

    ]

  }));



  children.push(new docx.Paragraph({ spacing: { before: 40, after: 60 }, children: [] }));



  // Questions

  questions.forEach((q, idx) => {

    const qNum = idx + 1;



    // Passage (if any)

    if (q.passage) {

      children.push(new docx.Paragraph({

        spacing: { before: 80, after: 60 },

        shading: { type: docx.ShadingType.CLEAR, fill: 'F3F4F6' },

        children: this.parseFormattedRuns(q.passage, 22)

      }));

    }



    // Question line: Câu X. (Bold Blue) + text

    const qRuns = [

      new docx.TextRun({ text: `Câu ${qNum}. `, bold: true, color: '0000FF', font: 'Times New Roman', size: 24 })

    ];

    qRuns.push(...this.parseFormattedRuns(q.question, 24));



    children.push(new docx.Paragraph({

      spacing: { before: 80, after: 40 },

      children: qRuns

    }));



    // Answers integrated into question

    if (q.type === 'true_false' && Array.isArray(q.items) && q.items.length > 0) {

      q.items.forEach(it => {

        if (!it) return;

        const label = '   ' + String(it.label || 'a').toLowerCase() + ') ';

        const isTrue = this.isItemCorrect(it);

        const cleanText = this.cleanItemText(it.text);

        const textRuns = this.parseFormattedRuns(cleanText, 24);

        children.push(new docx.Paragraph({

          spacing: { before: 20, after: 20 },

          children: [

            new docx.TextRun({

              text: label,

              bold: true,

              underline: isTrue ? { type: docx.UnderlineType.SINGLE } : undefined,

              color: '0000FF',

              font: 'Times New Roman',

              size: 24

            }),

            ...textRuns

          ]

        }));

      });

    } else if (q.type === 'short_answer' || (Array.isArray(q.options) && q.options.length === 1 && String(q.options[0]).includes('Đáp số:'))) {

      const rawAns = q.correctAnswer || (q.options && q.options[0] ? this.stripHtml(q.options[0]).replace('Đáp số:', '').trim() : '');

      const cleanAns = rawAns.replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').trim();

      children.push(new docx.Paragraph({

        spacing: { before: 30, after: 40 },

        children: [

          new docx.TextRun({ text: 'Trả lời: [', bold: true, font: 'Times New Roman', size: 24 }),

          new docx.TextRun({ text: cleanAns || '......', bold: true, color: '0000FF', font: 'Times New Roman', size: 24 }),

          new docx.TextRun({ text: ']', bold: true, font: 'Times New Roman', size: 24 })

        ]

      }));

    } else if (Array.isArray(q.options) && q.options.length > 0) {

      const letters = ['A', 'B', 'C', 'D'];

      const correctIdx = typeof q.correct === 'number' ? q.correct : -1;



      const cleanOpts = q.options.map((opt, oIdx) => {

        let str = this.stripHtml(opt).trim();

        const letter = letters[oIdx] || 'A';

        str = str.replace(/^[A-D][\.\:\s]+/i, '').trim();

        return { letter: letter + '.', text: str, isCorrect: (oIdx === correctIdx) };

      });



      const maxLen = Math.max(...cleanOpts.map(o => (o.letter + ' ' + o.text).length));



      function makeOptRuns(opt) {

        return [

          new docx.TextRun({

            text: '   ' + opt.letter + ' ',

            bold: true,

            underline: opt.isCorrect ? { type: docx.UnderlineType.SINGLE } : undefined,

            color: '0000FF',

            font: 'Times New Roman',

            size: 24

          }),

          new docx.TextRun({

            text: opt.text,

            font: 'Times New Roman',

            size: 24

          })

        ];

      }



      if (cleanOpts.length === 4 && maxLen <= 26) {

        // 1 row 4 columns

        const optCells = cleanOpts.map(opt => new docx.TableCell({

          width: { size: 25, type: docx.WidthType.PERCENTAGE },

          borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone },

          children: [new docx.Paragraph({ spacing: { before: 20, after: 20 }, children: makeOptRuns(opt) })]

        }));

        children.push(new docx.Table({

          width: { size: 100, type: docx.WidthType.PERCENTAGE },

          borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone, insideHorizontal: borderNone, insideVertical: borderNone },

          rows: [new docx.TableRow({ children: optCells })]

        }));

      } else if (cleanOpts.length === 4 && maxLen <= 50) {

        // 2 rows 2 columns

        const row1 = new docx.TableRow({

          children: [

            new docx.TableCell({ width: { size: 50, type: docx.WidthType.PERCENTAGE }, borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone }, children: [new docx.Paragraph({ spacing: { before: 20, after: 20 }, children: makeOptRuns(cleanOpts[0]) })] }),

            new docx.TableCell({ width: { size: 50, type: docx.WidthType.PERCENTAGE }, borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone }, children: [new docx.Paragraph({ spacing: { before: 20, after: 20 }, children: makeOptRuns(cleanOpts[1]) })] })

          ]

        });

        const row2 = new docx.TableRow({

          children: [

            new docx.TableCell({ width: { size: 50, type: docx.WidthType.PERCENTAGE }, borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone }, children: [new docx.Paragraph({ spacing: { before: 20, after: 20 }, children: makeOptRuns(cleanOpts[2]) })] }),

            new docx.TableCell({ width: { size: 50, type: docx.WidthType.PERCENTAGE }, borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone }, children: [new docx.Paragraph({ spacing: { before: 20, after: 20 }, children: makeOptRuns(cleanOpts[3]) })] })

          ]

        });

        children.push(new docx.Table({

          width: { size: 100, type: docx.WidthType.PERCENTAGE },

          borders: { top: borderNone, bottom: borderNone, left: borderNone, right: borderNone, insideHorizontal: borderNone, insideVertical: borderNone },

          rows: [row1, row2]

        }));

      } else {

        // Individual paragraphs

        cleanOpts.forEach(opt => {

          children.push(new docx.Paragraph({

            spacing: { before: 20, after: 20 },

            children: makeOptRuns(opt)

          }));

        });

      }

    }



    // Explanation (if present)

    const expText = this.stripHtml(q.explanation);

    if (expText && !expText.startsWith('Đáp án chính xác:')) {

      children.push(new docx.Paragraph({

        spacing: { before: 30, after: 20 },

        children: [

          new docx.TextRun({ text: '   Hướng dẫn giải: ', bold: true, italics: true, color: '1E40AF', font: 'Times New Roman', size: 22 })

        ]

      }));

      children.push(new docx.Paragraph({

        indent: { left: 400 },

        spacing: { before: 10, after: 40 },

        children: this.parseFormattedRuns(q.explanation, 22)

      }));

    }

  });



  // End marker

  children.push(new docx.Paragraph({

    alignment: docx.AlignmentType.CENTER,

    spacing: { before: 200, after: 200 },

    children: [

      new docx.TextRun({ text: '---------- HẾT ----------', bold: true, font: 'Times New Roman', size: 24 })

    ]

  }));



  // Page break for summary matrix

  children.push(new docx.Paragraph({

    children: [new docx.PageBreak()]

  }));



  // Summary answers table

  children.push(new docx.Paragraph({

    alignment: docx.AlignmentType.CENTER,

    spacing: { before: 100, after: 120 },

    children: [

      new docx.TextRun({ text: 'BẢNG ĐÁP ÁN TỔNG HỢP', bold: true, color: '0000FF', font: 'Times New Roman', size: 26 })

    ]

  }));



  const letters = ['A', 'B', 'C', 'D'];

  const totalQ = questions.length;



  for (let rowStart = 0; rowStart < totalQ; rowStart += 10) {

    const rowEnd = Math.min(rowStart + 10, totalQ);

    const colCount = rowEnd - rowStart;

    const colWidthPct = Math.floor(100 / colCount);



    const headerCells = [];

    const dataCells = [];



    for (let i = rowStart; i < rowEnd; i++) {

      const q = questions[i];

      let ansText = '-';

      if (q) {

        if (q.type === 'true_false' && Array.isArray(q.items)) {

          ansText = q.items.map(it => this.isItemCorrect(it) ? 'Đ' : 'S').join('/');

        } else if (q.type === 'short_answer') {

          ansText = q.correctAnswer || (q.options && q.options[0] ? this.stripHtml(q.options[0]).replace('Đáp số:', '').trim() : '-');

        } else {

          const cIdx = typeof q.correct === 'number' ? q.correct : 0;

          ansText = letters[cIdx] || 'A';

        }

      }



      headerCells.push(new docx.TableCell({

        width: { size: colWidthPct, type: docx.WidthType.PERCENTAGE },

        borders: cellBordersGrid,

        shading: { type: docx.ShadingType.CLEAR, fill: 'E5E7EB' },

        children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: 'Câu ' + (i + 1), bold: true, font: 'Times New Roman', size: 22 })] })]

      }));



      dataCells.push(new docx.TableCell({

        width: { size: colWidthPct, type: docx.WidthType.PERCENTAGE },

        borders: cellBordersGrid,

        children: [new docx.Paragraph({ alignment: docx.AlignmentType.CENTER, children: [new docx.TextRun({ text: ansText, bold: true, color: '0000FF', font: 'Times New Roman', size: 22 })] })]

      }));

    }



    children.push(new docx.Table({

      width: { size: 100, type: docx.WidthType.PERCENTAGE },

      borders: cellBordersGrid,

      rows: [

        new docx.TableRow({ children: headerCells }),

        new docx.TableRow({ children: dataCells })

      ]

    }));



    children.push(new docx.Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));

  }



  return new docx.Document({

    styles: {

      default: {

        document: {

          run: { font: 'Times New Roman', size: 24 },

          paragraph: { spacing: { line: 276, before: 30, after: 30 } }

        }

      }

    },

    sections: [{

      properties: {

        page: {

          size: { width: 11906, height: 16838 },

          margin: { top: 1134, bottom: 1134, left: 1417, right: 1134 }

        }

      },

      children

    }]

  });

  },



  async downloadExamDocx(targetExam = null) {

    const exam = targetExam || this.currentExam;

    if (!exam) {

      this.showToast('Không có dữ liệu đề thi để xuất file Word!', 'error');

      return;

    }



    const rawTitle = exam.title ? String(exam.title) : 'ĐỀ THI';

    const cleanTitle = rawTitle.replace(/^OLM:\s*/i, '').trim() || 'De-thi';

    const safeTitle = cleanTitle.replace(/[\/\\?%*:|"<>]/g, '_').trim() || 'de-thi';

    const docxFilename = `${safeTitle}.docx`;



    // Phase 1: Try pre-built genuine .docx file

    if (exam.id) {

      try {

        const prebuiltUrl = `data/docx/${encodeURIComponent(exam.id)}.docx`;

        const resp = await fetch(prebuiltUrl, { method: 'GET', cache: 'no-cache' });

        if (resp.ok) {

          const blob = await resp.blob();

          if (blob && blob.size > 1000) {

            this.triggerBlobDownload(blob, docxFilename);

            this.showToast(`Đã tải file Word (.docx): ${safeTitle}`, 'success');

            return;

          }

        }

      } catch (err) {

        console.warn('Pre-built docx fetch bypassed:', err);

      }

    }



    // Phase 2: Dynamic client-side genuine .docx generation via docx.js

    if (typeof docx !== 'undefined' && docx.Document && docx.Packer) {

      try {

        this.showToast('Đang tạo file Word (.docx) chuẩn OpenXML...', 'info');

        const doc = this.buildDocxDocument(exam);

        const blob = await docx.Packer.toBlob(doc);

        this.triggerBlobDownload(blob, docxFilename);

        this.showToast(`Đã tạo và tải file Word (.docx) thành công!`, 'success');

        return;

      } catch (genErr) {

        console.error('Client-side docx.js generation failed:', genErr);

      }

    }



    // Phase 3: Ultimate Fallback (HTML wrapped .docx)

    this.downloadExamWordFallback(exam, docxFilename);

  },



  downloadExamWord(targetExam = null) {

    return this.downloadExamDocx(targetExam);

  },



  /**

   * Graceful Fallback if docx engine fails

   */

  downloadExamWordFallback(exam, filename) {

    const rawTitle = exam.title ? String(exam.title) : 'ĐỀ THI';

    const title = rawTitle.trim();

    const cleanTitle = title.replace(/^OLM:\s*/i, '').trim() || 'Đề thi trắc nghiệm';

    const subject = exam.subject ? String(exam.subject).trim() : 'Chung';

    const grade = typeof exam.grade === 'number' ? ('Lớp ' + exam.grade) : String(exam.grade || 'Lớp 12');

    const duration = Number(exam.duration || exam.durationMinutes) || 45;



    let docHtml = `

      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>

      <head>

        <meta charset='utf-8'>

        <title>${cleanTitle}</title>

        <!--[if gte mso 9]>

        <xml>

          <w:WordDocument>

            <w:View>Print</w:View>

            <w:Zoom>100</w:Zoom>

            <w:DoNotOptimizeForBrowser/>

          </w:WordDocument>

        </xml>

        <![endif]-->

        <style>

          @page Section1 { size: 21.0cm 29.7cm; margin: 2.0cm 2.0cm 2.0cm 2.5cm; }

          div.Section1 { page: Section1; }

          body { font-family: 'Times New Roman', serif; font-size: 13pt; line-height: 1.35; color: #000; }

        </style>

      </head>

      <body>

      <div class='Section1'>

        <h2 style='text-align:center;'>${cleanTitle.toUpperCase()}</h2>

        <p>Môn: ${subject} - ${grade} | Thời gian: ${duration} phút</p>

      </div>

      </body>

      </html>

    `;



    const blob = new Blob(['\ufeff' + docHtml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    this.triggerBlobDownload(blob, filename);

    this.showToast(`Đã tải file: ${filename}`, 'success');

  },

  downloadExamText() {

    this.downloadExamWord();

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



    const questions = this.currentExam.questions || [];

    const letters = ['A', 'B', 'C', 'D'];



    container.innerHTML = questions.map((q, idx) => {

      const qId = q.id || (idx + 1);

      const prevQ = questions[idx - 1];

      const passageHtml = this.getPassageHtml(q, prevQ);

      const isFlagged = !!this.examFlaggedQuestions[qId];



      // CASE 1: True / False Group (GDPT 2018 format)

      if (q.type === 'true_false' && Array.isArray(q.items)) {

        const qAnswers = (typeof this.examUserAnswers[qId] === 'object' && this.examUserAnswers[qId] !== null) 

          ? this.examUserAnswers[qId] 

          : {};



        const itemsHtml = q.items.map(item => {

          const userVal = qAnswers[item.label];



          return `

            <div class="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">

              <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">

                <span class="font-bold text-blue-600 dark:text-blue-400 mr-1.5">${item.label})</span>

                <span>${this.cleanItemText(item.text)}</span>

              </div>

              <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">

                <button 

                  type="button" 

                  onclick="app.selectTrueFalseAnswer(${qId}, '${item.label}', true)"

                  class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${

                    userVal === true 

                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-500/20' 

                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'

                  }"

                >

                  Đúng

                </button>

                <button 

                  type="button" 

                  onclick="app.selectTrueFalseAnswer(${qId}, '${item.label}', false)"

                  class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${

                    userVal === false 

                      ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-500/20' 

                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/40'

                  }"

                >

                  Sai

                </button>

              </div>

            </div>

          `;

        }).join('');



        return `

          ${passageHtml}

          <div id="exam-q-${qId}" class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start justify-between gap-3">

              <div class="flex items-start gap-3">

                <span class="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-extrabold text-xs shrink-0">

                  Câu ${idx + 1}

                </span>

                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">

                  ${q.question}

                  <div class="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">Dạng trắc nghiệm Đúng / Sai (GDPT 2018 - Chọn Đúng hoặc Sai cho mỗi ý a, b, c, d)</div>

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



            <div class="space-y-2.5 pt-2">

              ${itemsHtml}

            </div>

          </div>

        `;

      }



      // CASE 1B: Short Answer (Trả lời ngắn GDPT 2018 - Ô nhập đáp án trực tiếp)

      if (this.isShortAnswerQuestion(q)) {

        const currentVal = typeof this.examUserAnswers[qId] === 'string' ? this.examUserAnswers[qId] : '';

        return `

          ${passageHtml}

          <div id="exam-q-${qId}" class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start justify-between gap-3">

              <div class="flex items-start gap-3">

                <span class="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-extrabold text-xs shrink-0">

                  Câu ${idx + 1}

                </span>

                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">

                  ${q.question}

                  <div class="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">Dạng Trả lời ngắn (GDPT 2018 - Nhập đáp số chính xác, dùng dấu phẩy hoặc chấm đều được)</div>

                </div>

              </div>



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



            <div class="pt-2">

              <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Câu trả lời của bạn:</label>

              <input

                type="text"

                value="${this.escapeAttr(currentVal)}"

                oninput="app.handleExamShortAnswerInput(${qId}, this.value)"

                placeholder="Nhập đáp số (ví dụ: 61,5 hoặc 101)..."

                autocomplete="off"

                class="w-full sm:max-w-sm px-4 py-3 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-slate-950 transition-all"

              />

            </div>

          </div>

        `;

      }



      // CASE 2: Standard 4-choice questions

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

        ${passageHtml}

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



  isShortAnswerQuestion(q) {

    if (!q) return false;

    if (q.type === 'short_answer') return true;

    return Array.isArray(q.options) && q.options.length === 1 && String(q.options[0]).includes('Đáp số:');

  },



  getShortAnswerValue(q) {

    if (!q) return '';

    let raw = q.correctAnswer;

    if ((raw === undefined || raw === null || String(raw).trim() === '') && Array.isArray(q.options) && q.options[0]) {

      raw = this.stripHtml(q.options[0]).replace(/^Đáp số:\s*/i, '').trim();

    }

    return String(raw || '').replace(/^[\[\(]/, '').replace(/[\]\)]$/, '').trim();

  },



  isShortAnswerMatch(userVal, expectedVal) {

    const clean = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '');

    const uRaw = clean(userVal);

    if (!uRaw) return false;

    const variants = String(expectedVal || '').split(/\|\||\||;/).map(clean).filter(Boolean);

    if (variants.length === 0) return false;

    const uNorm = uRaw.replace(/,/g, '.');

    const uNum = Number(uNorm);

    const uIsNum = uNorm !== '' && !Number.isNaN(uNum) && Number.isFinite(uNum);

    return variants.some(v => {

      if (uRaw === v) return true;

      const vNorm = v.replace(/,/g, '.');

      if (uNorm === vNorm) return true;

      const vNum = Number(vNorm);

      if (uIsNum && vNorm !== '' && !Number.isNaN(vNum) && Number.isFinite(vNum)) {

        return Math.abs(uNum - vNum) < 1e-6;

      }

      return false;

    });

  },



  escapeAttr(str) {

    return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  },



  handleExamShortAnswerInput(qId, val) {

    const trimmed = String(val || '');

    if (trimmed.trim() === '') {

      delete this.examUserAnswers[qId];

    } else {

      this.examUserAnswers[qId] = trimmed;

    }

    this.renderExamPalette();

  },



  selectTrueFalseAnswer(qId, label, val) {

    if (!this.examUserAnswers[qId] || typeof this.examUserAnswers[qId] !== 'object') {

      this.examUserAnswers[qId] = {};

    }

    this.examUserAnswers[qId][label] = val;

    this.renderExamQuestions();

    this.renderExamPalette();

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

      let isAnswered = false;

      if (q.type === 'true_false' && Array.isArray(q.items)) {

        const ansObj = this.examUserAnswers[qId];

        isAnswered = ansObj && typeof ansObj === 'object' && q.items.every(it => ansObj[it.label] !== undefined);

      } else if (this.isShortAnswerQuestion(q)) {

        isAnswered = typeof this.examUserAnswers[qId] === 'string' && this.examUserAnswers[qId].trim() !== '';

      } else {

        isAnswered = this.examUserAnswers[qId] !== undefined;

      }

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



      if (q.type === 'true_false' && Array.isArray(q.items)) {

        const userObj = (typeof this.examUserAnswers[qId] === 'object' && this.examUserAnswers[qId] !== null) 

          ? this.examUserAnswers[qId] 

          : {};



        let subCorrect = 0;

        const subReview = q.items.map(it => {

          const userVal = userObj[it.label];

          const correctVal = this.isItemCorrect(it);

          const isRight = userVal === correctVal;

          if (isRight) subCorrect++;

          return {

            label: it.label,

            text: this.cleanItemText(it.text),

            userChoice: userVal,

            correctChoice: correctVal,

            isCorrect: isRight,

            explanation: it.explanation

          };

        });



        // GDPT 2018 grading scale for True/False questions (total 1 pt):

        // 1 right: 0.1, 2 right: 0.25, 3 right: 0.5, 4 right: 1.0

        let weight = 0;

        if (subCorrect === 1) weight = 0.1;

        else if (subCorrect === 2) weight = 0.25;

        else if (subCorrect === 3) weight = 0.5;

        else if (subCorrect === 4) weight = 1.0;



        correctCount += weight;



        return {

          questionNumber: idx + 1,

          type: 'true_false',

          question: q.question,

          subReview,

          isCorrect: subCorrect === q.items.length,

          subCorrect,

          totalSub: q.items.length,

          weight,

          explanation: q.explanation,

          diagram: q.diagram,

          diagramCaption: q.diagramCaption,

          images: q.images,

          image: q.image

        };

      }



      if (this.isShortAnswerQuestion(q)) {

        const userText = typeof this.examUserAnswers[qId] === 'string' ? this.examUserAnswers[qId].trim() : '';

        const expectedAns = this.getShortAnswerValue(q);

        const isCorrect = this.isShortAnswerMatch(userText, expectedAns);

        if (isCorrect) correctCount++;

        return {

          questionNumber: idx + 1,

          type: 'short_answer',

          question: q.question,

          userText,

          expectedAns,

          isCorrect,

          explanation: q.explanation,

          diagram: q.diagram,

          diagramCaption: q.diagramCaption,

          images: q.images,

          image: q.image

        };

      }



      const userChoice = this.examUserAnswers[qId];

      const isCorrect = userChoice === q.correct;

      if (isCorrect) correctCount++;



      return {

        questionNumber: idx + 1,

        type: 'single',

        question: q.question,

        options: q.options,

        userChoice,

        correctChoice: q.correct,

        isCorrect,

        explanation: q.explanation,

        diagram: q.diagram,

        diagramCaption: q.diagramCaption,

        images: q.images,

        image: q.image

      };

    });



    const timeSpentSeconds = this.examTotalSeconds - Math.max(0, this.examSecondsRemaining);

    const score = totalQ > 0 ? ((correctCount / totalQ) * 10).toFixed(1) : 0;

    const accuracy = totalQ > 0 ? Math.round((correctCount / totalQ) * 100) : 0;



    this.lastExamResult = {

      examTitle: this.currentExam.title,

      score,

      correctCount: correctCount.toFixed(1).replace(/\.0$/, ''),

      totalCount: totalQ,

      accuracy,

      timeSpentSeconds,

      detailedReview

    };



    this.renderResultScreen();

  },



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

        // REVIEW CASE 1: True / False GDPT 2018

        if (item.type === 'true_false' && Array.isArray(item.subReview)) {

          const tfBadge = item.isCorrect

            ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">ĐÚNG ${item.subCorrect}/${item.totalSub || item.subReview.length} (+${item.weight}đ)</span>`

            : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">ĐÚNG ${item.subCorrect}/${item.totalSub || item.subReview.length} (+${item.weight}đ)</span>`;



          const rowsHtml = item.subReview.map(sr => {

            const uLbl = sr.userChoice === true ? 'Đúng' : (sr.userChoice === false ? 'Sai' : 'Chưa chọn');

            const cLbl = sr.correctChoice ? 'Đúng' : 'Sai';

            return `

              <div class="p-3 rounded-xl border text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${

                sr.isCorrect

                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400 text-slate-800 dark:text-slate-100'

                  : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-400 text-slate-800 dark:text-slate-100'

              }">

                <div class="flex-1"><strong class="text-blue-600 dark:text-blue-400 mr-1">${sr.label})</strong> ${sr.text}</div>

                <div class="flex items-center gap-2 shrink-0 text-xs font-semibold">

                  <span class="${sr.isCorrect ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}">Bạn: ${uLbl}</span>

                  <span class="text-slate-400">|</span>

                  <span class="text-emerald-700 dark:text-emerald-300">Đáp án: ${cLbl}</span>

                </div>

              </div>

            `;

          }).join('');



          return `

            <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

              <div class="flex items-start justify-between gap-3">

                <div class="flex items-start gap-3">

                  <span class="px-2.5 py-1 rounded-xl bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-bold text-xs shrink-0">Câu ${item.questionNumber}</span>

                  <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">${item.question}</div>

                </div>

                <div class="shrink-0">${tfBadge}</div>

              </div>

              ${this.getDiagramHtml(item)}

              <div class="space-y-2 pt-1">${rowsHtml}</div>

              ${item.explanation ? `<div class="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-slate-700 dark:text-slate-200"><strong class="text-blue-700 dark:text-blue-300">Lời giải chi tiết:</strong> ${item.explanation}</div>` : ''}

            </div>

          `;

        }



        // REVIEW CASE 2: Short Answer

        if (item.type === 'short_answer') {

          const saBadge = item.isCorrect

            ? `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">ĐÚNG</span>`

            : `<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">SAI</span>`;

          return `

            <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

              <div class="flex items-start justify-between gap-3">

                <div class="flex items-start gap-3">

                  <span class="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-bold text-xs shrink-0">Câu ${item.questionNumber}</span>

                  <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">${item.question}</div>

                </div>

                <div class="shrink-0">${saBadge}</div>

              </div>

              ${this.getDiagramHtml(item)}

              <div class="flex flex-wrap items-center gap-3 pt-1 text-sm">

                <div class="px-4 py-2 rounded-xl border ${item.isCorrect ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200' : 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-800 dark:text-rose-200'}">

                  Bạn nhập: <strong>${this.escapeAttr(item.userText || 'Chưa nhập')}</strong>

                </div>

                <div class="px-4 py-2 rounded-xl border bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200">

                  Đáp án đúng: <strong>${this.escapeAttr(item.expectedAns || '—')}</strong>

                </div>

              </div>

              ${item.explanation ? `<div class="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-slate-700 dark:text-slate-200"><strong class="text-blue-700 dark:text-blue-300">Lời giải chi tiết:</strong> ${item.explanation}</div>` : ''}

            </div>

          `;

        }



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



    const questions = this.currentExam.questions || [];

    const letters = ['A', 'B', 'C', 'D'];



    container.innerHTML = questions.map((q, idx) => {

      const qId = q.id || (idx + 1);

      const prevQ = questions[idx - 1];

      const passageHtml = this.getPassageHtml(q, prevQ);



      // CASE 1: True / False Group (GDPT 2018 format)

      if (q.type === 'true_false' && Array.isArray(q.items)) {

        const pAns = (this.practiceAnswers[qId] && typeof this.practiceAnswers[qId] === 'object')

          ? this.practiceAnswers[qId]

          : {};



        const itemsHtml = q.items.map(item => {

          const st = pAns[item.label];

          let trueBtnClass = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';

          let falseBtnClass = 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300';



          const correctVal = this.isItemCorrect(item);

          const cleanText = this.cleanItemText(item.text);



          if (st) {

            if (correctVal === true) {

              trueBtnClass = 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400 font-bold';

            } else {

              falseBtnClass = 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400 font-bold';

            }



            if (st.selected === true && !st.isCorrect) {

              trueBtnClass = 'bg-rose-600 text-white border-rose-600 font-bold';

            } else if (st.selected === false && !st.isCorrect) {

              falseBtnClass = 'bg-rose-600 text-white border-rose-600 font-bold';

            }

          }



          return `

            <div class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 space-y-2">

              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">

                <div class="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1">

                  <span class="font-bold text-blue-600 dark:text-blue-400 mr-1.5">${item.label})</span>

                  <span>${cleanText}</span>

                </div>

                <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">

                  <button 

                    type="button" 

                    onclick="app.handlePracticeTrueFalseSelect(${qId}, '${item.label}', true)"

                    class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${trueBtnClass}"

                  >

                    Đúng

                  </button>

                  <button 

                    type="button" 

                    onclick="app.handlePracticeTrueFalseSelect(${qId}, '${item.label}', false)"

                    class="px-4 py-1.5 rounded-xl text-xs font-bold transition-all border ${falseBtnClass}"

                  >

                    Sai

                  </button>

                </div>

              </div>

              ${st ? `

                <div class="text-xs pt-1.5 border-t border-slate-200 dark:border-slate-700/80 flex items-start gap-1.5 ${st.isCorrect ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 dark:text-rose-400'}">

                  <i data-lucide="${st.isCorrect ? 'check-circle' : 'alert-circle'}" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>

                  <span>${st.isCorrect ? 'Chính xác! ' : 'Chưa đúng! '}${item.explanation || ''}</span>

                </div>

              ` : ''}

            </div>

          `;

        }).join('');



        return `

          ${passageHtml}

          <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start gap-3">

              <span class="px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs shrink-0">

                Câu ${idx + 1}

              </span>

              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">

                ${q.question}

                <div class="text-xs text-blue-600 dark:text-blue-400 font-semibold mt-1">Luyện tập Đúng / Sai (GDPT 2018 - Chọn Đúng hoặc Sai cho mỗi ý)</div>

              </div>

            </div>



            ${this.getDiagramHtml(q)}



            <div class="space-y-3 pt-2">

              ${itemsHtml}

            </div>

          </div>

        `;

      }



      // CASE 1B: Short Answer in Practice Mode (Nhập đáp án + nút Kiểm tra ngay)

      if (this.isShortAnswerQuestion(q)) {

        const st = this.practiceAnswers[qId];

        const expectedAns = this.getShortAnswerValue(q);

        const curVal = st && typeof st.value === 'string' ? st.value : '';

        return `

          ${passageHtml}

          <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4">

            <div class="flex items-start gap-3">

              <span class="px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 font-extrabold text-xs shrink-0">

                Câu ${idx + 1}

              </span>

              <div class="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">

                ${q.question}

                <div class="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-1">Luyện tập Trả lời ngắn (Nhập đáp số rồi bấm Kiểm tra)</div>

              </div>

            </div>



            ${this.getDiagramHtml(q)}



            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-2">

              <input

                id="practice-sa-input-${qId}"

                type="text"

                value="${this.escapeAttr(curVal)}"

                onkeydown="if(event.key==='Enter'){app.handlePracticeShortAnswerCheck(${qId});}"

                placeholder="Nhập đáp số (VD: 61,5)..."

                autocomplete="off"

                class="flex-1 sm:max-w-xs px-4 py-2.5 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 font-bold text-sm focus:outline-none focus:border-emerald-500"

              />

              <button

                type="button"

                onclick="app.handlePracticeShortAnswerCheck(${qId})"

                class="px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm transition-all shadow-sm"

              >

                Kiểm tra

              </button>

            </div>



            ${st ? `

              <div class="p-4 rounded-2xl border ${

                st.isCorrect

                  ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'

                  : 'bg-rose-50/80 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200'

              } space-y-1.5 text-sm">

                <div class="font-bold flex items-center gap-2">

                  <i data-lucide="${st.isCorrect ? 'check-circle' : 'alert-circle'}" class="w-4 h-4"></i>

                  <span>${st.isCorrect ? 'Chính xác!' : `Chưa chính xác! Đáp án đúng là: ${this.escapeAttr(expectedAns)}`}</span>

                </div>

                ${q.explanation ? `<div class="text-xs text-slate-700 dark:text-slate-200 leading-relaxed pl-6">${q.explanation}</div>` : ''}

              </div>

            ` : ''}

          </div>

        `;

      }



      // CASE 2: Standard 4-choice questions

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

        ${passageHtml}

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



  handlePracticeTrueFalseSelect(qId, label, val) {

    if (!this.currentExam) return;

    const q = (this.currentExam.questions || []).find(x => (x.id || 0) === qId);

    if (!q || !Array.isArray(q.items)) return;



    const item = q.items.find(x => x.label === label);

    if (!item) return;



    if (!this.practiceAnswers[qId] || typeof this.practiceAnswers[qId] !== 'object') {

      this.practiceAnswers[qId] = {};

    }



    const correctVal = this.isItemCorrect(item);



    this.practiceAnswers[qId][label] = {

      selected: val,

      isCorrect: val === correctVal

    };



    this.renderPracticeQuestions();

  },



  handlePracticeShortAnswerCheck(qId) {

    if (!this.currentExam) return;

    const q = (this.currentExam.questions || []).find(x => (x.id || 0) === qId);

    if (!q) return;

    const inp = document.getElementById(`practice-sa-input-${qId}`);

    const val = inp ? inp.value.trim() : '';

    const expected = this.getShortAnswerValue(q);

    this.practiceAnswers[qId] = {

      value: val,

      isCorrect: this.isShortAnswerMatch(val, expected)

    };

    this.renderPracticeQuestions();

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

      this.renderTeacherFilter();

      this.renderSubjectFilters();

      this.updateTabCounts();

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

