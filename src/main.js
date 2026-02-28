import './style.css';

// ========================================
// データ構造
// ========================================

class ShiftManagementApp {
  constructor() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    // 1-3月なら前年度
    this.selectedYear = currentMonth <= 3 ? today.getFullYear() - 1 : today.getFullYear();
    this.currentMonth = currentMonth;

    // スケジュール管理: 最大4つ
    // schedules = [ { name, doctors, shifts, monthlyRequests, monthlyLocks }, ... ]
    this.schedules = [
      this.createEmptySchedule('内科')
    ];
    this.currentScheduleIndex = 0;

    this.editingDoctorId = null;
    this.requestingDoctorId = null;

    this.init();
    this.deferredPrompt = null;
  }

  // 年度と月から実年を取得
  getTargetYear(fiscalYear, month) {
    return month <= 3 ? fiscalYear + 1 : fiscalYear;
  }

  // 空のスケジュールを作成
  createEmptySchedule(name = 'スケジュール') {
    return {
      name,
      doctors: [],
      shifts: {},
      monthlyRequests: {},
      monthlyLocks: {}
    };
  }

  // 現在有効なスケジュール
  get currentSchedule() {
    return this.schedules[this.currentScheduleIndex];
  }

  // 下位山取りのプロパティを現在スケジュールに委譲
  get doctors() { return this.currentSchedule.doctors; }
  set doctors(v) { this.currentSchedule.doctors = v; }
  get shifts() { return this.currentSchedule.shifts; }
  set shifts(v) { this.currentSchedule.shifts = v; }
  get monthlyRequests() { return this.currentSchedule.monthlyRequests; }
  set monthlyRequests(v) { this.currentSchedule.monthlyRequests = v; }
  get monthlyLocks() { return this.currentSchedule.monthlyLocks; }
  set monthlyLocks(v) { this.currentSchedule.monthlyLocks = v; }
  get customHolidays() {
    if (!this.currentSchedule.customHolidays) {
      this.currentSchedule.customHolidays = {};
    }
    return this.currentSchedule.customHolidays;
  }
  set customHolidays(v) { this.currentSchedule.customHolidays = v; }

  init() {
    this.loadData();
    // ロードしたデータが年度に対応していない場合の補正は不要（数値として扱われるため）

    this.setupEventListeners();
    this.renderYearSelects();
    this.showSetupScreen();
    this.setupPWA();
  }

  // ... (loadData, saveData, ... は変更なし)

  // ========================================
  // レンダリング
  // ========================================

  renderYearSelects() {
    const currentYear = new Date().getFullYear();
    // 前後数年分
    const years = [];
    for (let i = currentYear - 2; i <= currentYear + 3; i++) {
      years.push(i);
    }

    const yearSelectHTML = years.map(year =>
      `<option value="${year}" ${year === this.selectedYear ? 'selected' : ''}>${year}年度</option>`
    ).join('');

    // 年度選択（セットアップ用とメイン画面用）
    document.getElementById('year-select').innerHTML = yearSelectHTML;
    document.getElementById('current-year').innerHTML = yearSelectHTML;

    // 月選択（4月始まり）
    const months = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthSelectHTML = months.map(month =>
      `<option value="${month}" ${month === this.currentMonth ? 'selected' : ''}>${month}月</option>`
    ).join('');

    document.getElementById('current-month').innerHTML = monthSelectHTML;
  }

  // ========================================
  // データ管理
  // ========================================

  loadData() {
    const savedData = localStorage.getItem('shiftManagementData');
    if (savedData) {
      const data = JSON.parse(savedData);
      this.selectedYear = data.selectedYear || this.selectedYear;
      this.currentMonth = data.currentMonth || this.currentMonth;
      this.currentScheduleIndex = data.currentScheduleIndex || 0;

      if (data.schedules && Array.isArray(data.schedules)) {
        this.schedules = data.schedules;
      } else {
        // 旧形式データのマイグレーション
        const sched = this.createEmptySchedule('内科');
        sched.doctors = data.doctors || [];
        sched.shifts = data.shifts || {};
        sched.monthlyRequests = data.monthlyRequests || {};
        sched.monthlyLocks = data.monthlyLocks || {};
        this.schedules = [sched];
      }

      // インデックスが範囲外なら修正
      if (this.currentScheduleIndex >= this.schedules.length) {
        this.currentScheduleIndex = 0;
      }
    }
  }

  saveData() {
    const data = {
      selectedYear: this.selectedYear,
      currentMonth: this.currentMonth,
      currentScheduleIndex: this.currentScheduleIndex,
      schedules: this.schedules
    };
    localStorage.setItem('shiftManagementData', JSON.stringify(data));
  }

  // ========================================
  // 画面制御
  // ========================================

  showSetupScreen() {
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('management-screen').classList.add('hidden');
  }

  showManagementScreen() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('management-screen').classList.remove('hidden');
    this.renderScheduleTabs();
    this.renderDoctorList();
    this.renderCalendar();
  }

  // ========================================
  // スケジュールタブ
  // ========================================

  renderScheduleTabs() {
    const container = document.getElementById('schedule-tabs');
    if (!container) return;

    const tabColors = ['var(--primary-600)', 'var(--warning-600, #d97706)', '#7c3aed', '#059669'];

    container.innerHTML = this.schedules.map((sched, idx) => {
      const isActive = idx === this.currentScheduleIndex;
      const color = tabColors[idx] || 'var(--primary-600)';
      return `
        <button
          onclick="app.switchSchedule(${idx})"
          style="
            padding: 0.75rem 1.5rem;
            border: none;
            background: ${isActive ? 'var(--gray-50)' : 'none'};
            cursor: pointer;
            font-size: 0.95rem;
            font-weight: ${isActive ? '700' : '500'};
            color: ${isActive ? color : 'var(--text-secondary)'};
            border-bottom: 3px solid ${isActive ? color : 'transparent'};
            margin-bottom: -2px;
            transition: all 0.2s;
            white-space: nowrap;
            border-radius: var(--radius-md) var(--radius-md) 0 0;
          "
        >
          📋 ${this.escapeHtml(sched.name)}
        </button>
      `;
    }).join('');

    // セクションタイトルも更新
    const titleEl = document.getElementById('schedule-section-title');
    if (titleEl) titleEl.textContent = `医師管理 — ${this.currentSchedule.name}`;
  }

  switchSchedule(index) {
    if (index < 0 || index >= this.schedules.length) return;
    this.currentScheduleIndex = index;
    this.saveData();
    this.renderScheduleTabs();
    this.renderDoctorList();
    this.renderCalendar();
  }

  // ========================================
  // イベントリスナー
  // ========================================

  setupEventListeners() {
    // 初期設定
    document.getElementById('start-btn').addEventListener('click', () => {
      const yearSelect = document.getElementById('year-select');
      this.selectedYear = parseInt(yearSelect.value);

      // スケジュール設定を読んでschedulesを構築
      const newSchedules = [];
      for (let i = 0; i < 4; i++) {
        const enabled = document.getElementById(`sched-enable-${i}`)?.checked;
        const name = document.getElementById(`sched-name-${i}`)?.value.trim() || `スケジュール${i + 1}`;
        if (enabled) {
          // 既存スケジュールがあれば復元、なければ新規
          const existing = this.schedules[i];
          newSchedules.push(existing ? { ...existing, name } : this.createEmptySchedule(name));
        }
      }

      if (newSchedules.length === 0) {
        alert('少なくとも1つのスケジュールを有効にしてください。');
        return;
      }

      this.schedules = newSchedules;
      this.currentScheduleIndex = 0;
      this.saveData();
      this.showManagementScreen();
    });

    // 年・月変更
    document.getElementById('current-year').addEventListener('change', (e) => {
      this.selectedYear = parseInt(e.target.value);
      this.saveData();
      this.renderCalendar();
      this.renderDoctorList();
    });

    document.getElementById('current-month').addEventListener('change', (e) => {
      this.currentMonth = parseInt(e.target.value);
      this.saveData();
      this.renderCalendar();
      this.renderDoctorList();
    });

    // 医師追加モーダル
    document.getElementById('add-doctor-btn').addEventListener('click', () => {
      this.showAddDoctorModal();
    });

    document.getElementById('close-add-doctor-modal').addEventListener('click', () => {
      this.hideAddDoctorModal();
    });

    document.getElementById('cancel-add-doctor').addEventListener('click', () => {
      this.hideAddDoctorModal();
    });

    document.getElementById('save-doctor').addEventListener('click', () => {
      this.saveNewDoctor();
    });

    // 医師編集モーダル
    document.getElementById('close-edit-doctor-modal').addEventListener('click', () => {
      this.hideEditDoctorModal();
    });

    document.getElementById('cancel-edit-doctor').addEventListener('click', () => {
      this.hideEditDoctorModal();
    });

    document.getElementById('update-doctor').addEventListener('click', () => {
      this.updateDoctor();
    });

    // リクエストモーダル
    document.getElementById('close-request-modal').addEventListener('click', () => {
      this.hideRequestModal();
    });

    document.getElementById('cancel-request').addEventListener('click', () => {
      this.hideRequestModal();
    });

    document.getElementById('save-request').addEventListener('click', () => {
      this.saveMonthlyRequest();
    });

    // 自動割り当て
    document.getElementById('auto-assign-btn').addEventListener('click', () => {
      this.autoAssignShifts();
    });

    document.getElementById('auto-assign-annual-btn').addEventListener('click', () => {
      this.autoAssignAnnualShifts();
    });

    // エクスポート
    document.getElementById('export-btn').addEventListener('click', () => {
      this.exportToCSV();
    });

    // 統計表示
    document.getElementById('show-stats-btn').addEventListener('click', () => {
      this.showStatsModal();
    });

    document.getElementById('close-stats-modal').addEventListener('click', () => {
      this.hideStatsModal();
    });

    document.getElementById('close-stats-btn').addEventListener('click', () => {
      this.hideStatsModal();
    });

    // CSVインポート
    document.getElementById('import-csv-btn').addEventListener('click', () => {
      this.showCSVImportModal();
    });

    document.getElementById('close-csv-help-modal').addEventListener('click', () => {
      this.hideCSVImportModal();
    });

    document.getElementById('cancel-csv-import').addEventListener('click', () => {
      this.hideCSVImportModal();
    });

    document.getElementById('select-csv-file').addEventListener('click', () => {
      document.getElementById('csv-file-input').click();
    });

    document.getElementById('csv-file-input').addEventListener('change', (e) => {
      this.handleCSVFileSelect(e);
    });

    // モーダル背景クリックで閉じる
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) {
          backdrop.classList.add('hidden');
        }
      });
    });
  }

  // ========================================
  // レンダリング
  // ========================================


  renderDoctorList() {
    const container = document.getElementById('doctor-list');

    if (this.doctors.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 2rem; color: var(--text-tertiary);">
          <p style="font-size: 1.2rem; margin-bottom: 0.5rem;">👨‍⚕️ まだ医師が登録されていません</p>
          <p>「医師を追加」ボタンから登録を開始してください</p>
        </div>
      `;
      return;
    }

    container.innerHTML = this.doctors.map(doctor => {
      const assignedShifts = this.getDoctorAssignedShifts(doctor.id);

      // NG日程とNG曜日の取得・整形
      const year = this.getTargetYear(this.selectedYear, this.currentMonth);
      const yearMonth = `${year}-${String(this.currentMonth).padStart(2, '0')}`;
      const ngDates = this.monthlyRequests[doctor.id]?.[yearMonth] || [];
      const ngDays = ngDates
        .map(d => parseInt(d.split('-')[2], 10))
        .sort((a, b) => a - b)
        .join(', ');

      const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
      const ngWeekdaysDisplay = (doctor.ngWeekdays || []).map(d => weekdayNames[d]).join(', ');

      const ngDisplayParts = [];
      if (ngWeekdaysDisplay) ngDisplayParts.push(`曜日: ${ngWeekdaysDisplay}`);
      if (ngDays) ngDisplayParts.push(`日付: ${ngDays}`);

      const ngDisplay = ngDisplayParts.length > 0 ? `
        <div style="font-size: 0.75rem; color: var(--danger-600); margin-top: 4px; font-weight: 500;">
          NG: ${ngDisplayParts.join(' / ')}
        </div>
      ` : `
        <div style="font-size: 0.75rem; color: var(--text-tertiary); margin-top: 4px;">
          NG: なし
        </div>
      `;

      return `
        <div class="doctor-item">
          <div class="doctor-info">
            <div class="doctor-name">${this.escapeHtml(doctor.name)}</div>
            ${ngDisplay}
          </div>
          <div class="doctor-stats">
            <div class="stat-item">
              <span class="stat-label">日直</span>
              <span class="stat-value">${assignedShifts.dayShifts}/${doctor.annualDayShifts}</span>
            </div>
            <div class="stat-item">
              <span class="stat-label">当直</span>
              <span class="stat-value">${assignedShifts.nightShifts}/${doctor.annualNightShifts}</span>
            </div>
          </div>
          <div class="doctor-actions">
            <button class="btn btn-sm btn-secondary" onclick="app.showRequestModal('${doctor.id}')">
              📅 月別設定
            </button>
            <button class="btn btn-sm btn-secondary" onclick="app.duplicateDoctor('${doctor.id}')">
              📋 複製
            </button>
            <button class="btn btn-sm btn-secondary" onclick="app.showEditDoctorModal('${doctor.id}')">
              ✏️ 編集
            </button>
            <button class="btn btn-sm btn-danger" onclick="app.deleteDoctor('${doctor.id}')">
              🗑️ 削除
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  renderCalendar() {
    const container = document.getElementById('calendar-container');
    const year = this.getTargetYear(this.selectedYear, this.currentMonth);
    const month = this.currentMonth;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    const isMonthLocked = !!this.monthlyLocks[yearMonth];

    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

    // 今日の日付を取得（時間部分をクリア）
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lockBtnClass = isMonthLocked ? 'btn-danger' : 'btn-secondary';
    const lockBtnIcon = isMonthLocked ? '🔒 ロック中' : '🔓 ロックする';
    const lockBtnTitle = isMonthLocked ? 'クリックしてロック解除' : 'クリックして編集をロック';

    let calendarHTML = `
      <div class="calendar">
        <div class="calendar-header">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex: 1;">
            <button class="btn btn-sm btn-secondary" onclick="app.navigateMonth(-1)" title="前月"
              style="padding: 0.25rem 0.75rem; font-size: 1.1rem; line-height: 1;">
              ◄
            </button>
            <div class="calendar-title" style="min-width: 200px; text-align: center;">${this.selectedYear}年度 ${monthNames[month - 1]} (${year}年)</div>
            <button class="btn btn-sm btn-secondary" onclick="app.navigateMonth(1)" title="次月"
              style="padding: 0.25rem 0.75rem; font-size: 1.1rem; line-height: 1;">
              ►
            </button>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            ${[4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3].map(m => `
              <button
                onclick="app.jumpToMonth(${m})"
                class="btn btn-sm ${m === month ? 'btn-primary' : 'btn-secondary'}"
                style="padding: 0.2rem 0.5rem; font-size: 0.75rem; min-width: 2.5rem;"
              >${m}月</button>
            `).join('')}
          </div>
          <button class="btn btn-sm ${lockBtnClass}" onclick="app.toggleMonthLock()" title="${lockBtnTitle}" style="margin-left: 0.5rem; flex-shrink: 0;">
            ${lockBtnIcon}
          </button>
        </div>
        <div class="calendar-grid">
          <div class="calendar-day-header">日</div>
          <div class="calendar-day-header">月</div>
          <div class="calendar-day-header">火</div>
          <div class="calendar-day-header">水</div>
          <div class="calendar-day-header">木</div>
          <div class="calendar-day-header">金</div>
          <div class="calendar-day-header">土</div>
    `;

    // 前月の空白セル
    for (let i = 0; i < startDayOfWeek; i++) {
      calendarHTML += '<div class="calendar-day other-month"></div>';
    }

    // 当月の日付
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);
      const dayOfWeek = date.getDay();
      const isHoliday = this.isHoliday(date);
      const isWeekendDefault = dayOfWeek === 0 || dayOfWeek === 6;

      // 過去の日付または月全体がロックされているかチェック
      const isPast = date < today;
      const isLocked = isPast || isMonthLocked;

      let dayClass = 'calendar-day';
      if (isHoliday && isWeekendDefault) dayClass += ' weekend';
      if (isHoliday && !isWeekendDefault) dayClass += ' holiday';
      if (isLocked) dayClass += ' locked'; // ロック用のスタイルが必要かも

      calendarHTML += `<div class="${dayClass}">`;

      const toggleDisplay = isLocked ? 'none' : 'block';
      const toggleLabel = isHoliday ? '🔴休日' : '🔵平日';

      calendarHTML += `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px;">
          <div class="day-number">${day}</div>
          <button class="btn btn-sm btn-secondary" style="padding: 2px 4px; font-size: 0.7rem; display: ${toggleDisplay}" onclick="app.toggleHoliday('${dateStr}')" title="平日/休日 切替">
            ${toggleLabel}
          </button>
        </div>
      `;

      // 休日は日直と当直、平日は当直のみ
      if (isHoliday) {
        // 日直
        const dayShiftDoctor = this.shifts[dateStr]?.dayShift;
        const isDayFixed = this.shifts[dateStr]?.dayLocked;
        const dayFixIcon = isDayFixed ? '<span title="固定" style="font-size:0.8em">📌</span> ' : '';

        const doctorName = dayShiftDoctor
          ? (this.doctors.find(d => d.id === dayShiftDoctor)?.name || 'BLANK')
          : 'BLANK';

        // ロックならonclickイベントをつけない
        const onClickAttr = isLocked ? '' : `onclick="app.editShift('${dateStr}', 'day')"`;
        const slotClass = isLocked ? 'shift-slot day-shift locked' : 'shift-slot day-shift';

        if (dayShiftDoctor) {
          calendarHTML += `
            <div class="${slotClass}" ${onClickAttr}>
              ${dayFixIcon}${this.escapeHtml(doctorName)}
            </div>
          `;
        } else {
          calendarHTML += `
            <div class="${slotClass} blank" ${onClickAttr}>
              ${isLocked ? '-' : 'BLANK'}
            </div>
          `;
        }
      }

      // 当直
      const nightShiftDoctor = this.shifts[dateStr]?.nightShift;
      const isNightFixed = this.shifts[dateStr]?.nightLocked;
      const nightFixIcon = isNightFixed ? '<span title="固定" style="font-size:0.8em">📌</span> ' : '';

      const nightDoctorName = nightShiftDoctor
        ? (this.doctors.find(d => d.id === nightShiftDoctor)?.name || 'BLANK')
        : 'BLANK';

      const onClickAttrNight = isLocked ? '' : `onclick="app.editShift('${dateStr}', 'night')"`;
      const slotClassNight = isLocked ? 'shift-slot night-shift locked' : 'shift-slot night-shift';

      if (nightShiftDoctor) {
        calendarHTML += `
          <div class="${slotClassNight}" ${onClickAttrNight}>
            ${nightFixIcon}${this.escapeHtml(nightDoctorName)}
          </div>
        `;
      } else {
        calendarHTML += `
          <div class="${slotClassNight} blank" ${onClickAttrNight}>
            ${isLocked ? '-' : 'BLANK'}
          </div>
        `;
      }

      calendarHTML += '</div>';
    }

    // 次月の空白セル
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = 7 - (totalCells % 7);
    if (remainingCells < 7) {
      for (let i = 0; i < remainingCells; i++) {
        calendarHTML += '<div class="calendar-day other-month"></div>';
      }
    }

    calendarHTML += '</div></div>';
    container.innerHTML = calendarHTML;
    this.calculateAnnualStats();
  }

  // 月のロック状態を切り替え
  toggleMonthLock() {
    const year = this.getTargetYear(this.selectedYear, this.currentMonth);
    const month = this.currentMonth;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    // 現在の状態を反転
    this.monthlyLocks[yearMonth] = !this.monthlyLocks[yearMonth];
    this.saveData();
    this.renderCalendar();
  }

  // 月ナビゲーション（前月・次月）
  navigateMonth(delta) {
    // 年度内での月順: 4,5,6,7,8,9,10,11,12,1,2,3
    const fiscalMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const currentIdx = fiscalMonths.indexOf(this.currentMonth);
    const newIdx = currentIdx + delta;

    if (newIdx < 0) {
      // 前年度へ
      this.selectedYear -= 1;
      this.currentMonth = 3; // 3月（前年度の末尾）
    } else if (newIdx >= fiscalMonths.length) {
      // 翌年度へ
      this.selectedYear += 1;
      this.currentMonth = 4; // 4月（次年度の先頭）
    } else {
      this.currentMonth = fiscalMonths[newIdx];
    }

    // セレクトボックスも同期
    const yearSelect = document.getElementById('current-year');
    const monthSelect = document.getElementById('current-month');
    if (yearSelect) yearSelect.value = this.selectedYear;
    if (monthSelect) monthSelect.value = this.currentMonth;

    this.saveData();
    this.renderCalendar();
    this.renderDoctorList();
  }

  // 月ジャンプ（同年度内の特定月へ）
  jumpToMonth(month) {
    this.currentMonth = month;

    const monthSelect = document.getElementById('current-month');
    if (monthSelect) monthSelect.value = month;

    this.saveData();
    this.renderCalendar();
    this.renderDoctorList();
  }

  calculateAnnualStats() {
    const year = this.selectedYear;
    const startDate = new Date(year, 3, 1);
    const endDate = new Date(year + 1, 2, 31);

    let weekdays = 0;
    let holidays = 0;
    let totalDays = 0;

    // index.htmlの要素があるか確認してからセット
    const yearElem = document.getElementById('stats-year');
    if (yearElem) yearElem.textContent = year;

    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      // isHolidayメソッドは実装済みと仮定
      const isHoliday = this.isHoliday(currentDate);

      if (isWeekend || isHoliday) {
        holidays++;
      } else {
        weekdays++;
      }
      totalDays++;

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const setContent = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setContent('stats-weekday-count', weekdays + '日');
    setContent('stats-holiday-count', holidays + '日');
    setContent('stats-total-days', totalDays + '日');
  }

  // ========================================
  // 医師管理
  // ========================================

  showAddDoctorModal() {
    document.getElementById('doctor-name').value = '';
    document.getElementById('doctor-department').value = '';
    document.getElementById('annual-day-shifts').value = '0';
    document.getElementById('annual-night-shifts').value = '0';
    document.querySelectorAll('.ng-weekday').forEach(cb => cb.checked = false);
    document.getElementById('add-doctor-modal').classList.remove('hidden');
  }

  hideAddDoctorModal() {
    document.getElementById('add-doctor-modal').classList.add('hidden');
  }

  saveNewDoctor() {
    const name = document.getElementById('doctor-name').value.trim();
    const annualDayShifts = parseInt(document.getElementById('annual-day-shifts').value) || 0;
    const annualNightShifts = parseInt(document.getElementById('annual-night-shifts').value) || 0;

    if (!name) {
      alert('名前は必須です');
      return;
    }

    const ngWeekdays = Array.from(document.querySelectorAll('.ng-weekday:checked'))
      .map(cb => parseInt(cb.value));

    const doctor = {
      id: this.generateId(),
      name,
      annualDayShifts,
      annualNightShifts,
      ngWeekdays
    };

    this.doctors.push(doctor);
    this.saveData();
    this.renderDoctorList();
    this.hideAddDoctorModal();
  }

  showEditDoctorModal(doctorId) {
    const doctor = this.doctors.find(d => d.id === doctorId);
    if (!doctor) return;

    this.editingDoctorId = doctorId;
    document.getElementById('edit-doctor-name').value = doctor.name;
    document.getElementById('edit-annual-day-shifts').value = doctor.annualDayShifts;
    document.getElementById('edit-annual-night-shifts').value = doctor.annualNightShifts;

    document.querySelectorAll('.edit-ng-weekday').forEach(cb => {
      cb.checked = doctor.ngWeekdays.includes(parseInt(cb.value));
    });

    document.getElementById('edit-doctor-modal').classList.remove('hidden');
  }

  hideEditDoctorModal() {
    document.getElementById('edit-doctor-modal').classList.add('hidden');
    this.editingDoctorId = null;
  }

  updateDoctor() {
    const doctor = this.doctors.find(d => d.id === this.editingDoctorId);
    if (!doctor) return;

    const name = document.getElementById('edit-doctor-name').value.trim();
    const annualDayShifts = parseInt(document.getElementById('edit-annual-day-shifts').value) || 0;
    const annualNightShifts = parseInt(document.getElementById('edit-annual-night-shifts').value) || 0;

    if (!name) {
      alert('名前は必須です');
      return;
    }

    const ngWeekdays = Array.from(document.querySelectorAll('.edit-ng-weekday:checked'))
      .map(cb => parseInt(cb.value));

    doctor.name = name;
    doctor.annualDayShifts = annualDayShifts;
    doctor.annualNightShifts = annualNightShifts;
    doctor.ngWeekdays = ngWeekdays;

    this.saveData();
    this.renderDoctorList();
    this.renderCalendar();
    this.hideEditDoctorModal();
  }

  deleteDoctor(doctorId) {
    if (!confirm('この医師を削除してもよろしいですか?')) return;

    this.doctors = this.doctors.filter(d => d.id !== doctorId);

    // シフトから削除
    Object.keys(this.shifts).forEach(date => {
      if (this.shifts[date].dayShift === doctorId) {
        delete this.shifts[date].dayShift;
      }
      if (this.shifts[date].nightShift === doctorId) {
        delete this.shifts[date].nightShift;
      }
    });

    // リクエストから削除
    delete this.monthlyRequests[doctorId];

    this.saveData();
    this.renderDoctorList();
    this.renderCalendar();
  }

  duplicateDoctor(doctorId) {
    const originalDoctor = this.doctors.find(d => d.id === doctorId);
    if (!originalDoctor) return;

    const newDoctor = {
      id: this.generateId(),
      name: originalDoctor.name + ' (コピー)',
      annualDayShifts: originalDoctor.annualDayShifts,
      annualNightShifts: originalDoctor.annualNightShifts,
      ngWeekdays: [...originalDoctor.ngWeekdays]
    };

    this.doctors.push(newDoctor);
    this.saveData();
    this.renderDoctorList();

    alert(`${originalDoctor.name} を複製しました。\n新しい医師名: ${newDoctor.name}`);
  }

  // ========================================
  // 統計表示
  // ========================================

  showStatsModal() {
    const container = document.getElementById('stats-container');

    if (this.doctors.length === 0) {
      container.innerHTML = `
        <div class="text-center" style="padding: 2rem; color: var(--text-tertiary);">
          <p>医師が登録されていません</p>
        </div>
      `;
      document.getElementById('stats-modal').classList.remove('hidden');
      return;
    }

    // 統計データを計算
    const stats = this.doctors.map(doctor => {
      const assigned = this.getDoctorAssignedShifts(doctor.id);
      return {
        doctor,
        assigned,
        dayProgress: doctor.annualDayShifts > 0
          ? Math.round((assigned.dayShifts / doctor.annualDayShifts) * 100)
          : 0,
        nightProgress: doctor.annualNightShifts > 0
          ? Math.round((assigned.nightShifts / doctor.annualNightShifts) * 100)
          : 0
      };
    });

    // 合計を計算
    const totalDayShifts = stats.reduce((sum, s) => sum + s.assigned.dayShifts, 0);
    const totalNightShifts = stats.reduce((sum, s) => sum + s.assigned.nightShifts, 0);
    const totalTargetDayShifts = stats.reduce((sum, s) => sum + s.doctor.annualDayShifts, 0);
    const totalTargetNightShifts = stats.reduce((sum, s) => sum + s.doctor.annualNightShifts, 0);

    let html = `
      <div class="stats-summary">
        <div class="stats-summary-item">
          <div class="stats-summary-label">総日直コマ数</div>
          <div class="stats-summary-value">${totalDayShifts}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
            目標: ${totalTargetDayShifts}
          </div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-label">総当直コマ数</div>
          <div class="stats-summary-value">${totalNightShifts}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
            目標: ${totalTargetNightShifts}
          </div>
        </div>
        <div class="stats-summary-item">
          <div class="stats-summary-label">登録医師数</div>
          <div class="stats-summary-value">${this.doctors.length}</div>
          <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
            スケジュール: ${this.currentSchedule.name}
          </div>
        </div>
      </div>

      <table class="stats-table">
        <thead>
          <tr>
            <th>医師名</th>
            <th>日直</th>
            <th>日直進捗</th>
            <th>当直</th>
            <th>当直進捗</th>
            <th>合計</th>
          </tr>
        </thead>
        <tbody>
    `;

    stats.forEach(stat => {
      const dayProgressClass = stat.dayProgress >= 100 ? 'complete' : stat.dayProgress > 100 ? 'over' : '';
      const nightProgressClass = stat.nightProgress >= 100 ? 'complete' : stat.nightProgress > 100 ? 'over' : '';
      const totalAssigned = stat.assigned.dayShifts + stat.assigned.nightShifts;
      const totalTarget = stat.doctor.annualDayShifts + stat.doctor.annualNightShifts;

      html += `
        <tr>
          <td><strong>${this.escapeHtml(stat.doctor.name)}</strong></td>
          <td>
            <span class="stat-number">${stat.assigned.dayShifts}</span> / ${stat.doctor.annualDayShifts}
          </td>
          <td>
            <div class="stat-progress">
              <div class="progress-bar">
                <div class="progress-fill ${dayProgressClass}" style="width: ${Math.min(stat.dayProgress, 100)}%"></div>
              </div>
              <span style="font-size: 0.875rem; color: var(--text-secondary); min-width: 45px;">${stat.dayProgress}%</span>
            </div>
          </td>
          <td>
            <span class="stat-number">${stat.assigned.nightShifts}</span> / ${stat.doctor.annualNightShifts}
          </td>
          <td>
            <div class="stat-progress">
              <div class="progress-bar">
                <div class="progress-fill ${nightProgressClass}" style="width: ${Math.min(stat.nightProgress, 100)}%"></div>
              </div>
              <span style="font-size: 0.875rem; color: var(--text-secondary); min-width: 45px;">${stat.nightProgress}%</span>
            </div>
          </td>
          <td>
            <strong style="color: var(--primary-700); font-size: 1.125rem;">${totalAssigned}</strong> / ${totalTarget}
          </td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    container.innerHTML = html;
    document.getElementById('stats-modal').classList.remove('hidden');
  }

  hideStatsModal() {
    document.getElementById('stats-modal').classList.add('hidden');
  }

  // ========================================
  // CSVインポート
  // ========================================

  showCSVImportModal() {
    document.getElementById('csv-preview-container').style.display = 'none';
    document.getElementById('csv-preview').innerHTML = '';
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-help-modal').classList.remove('hidden');
  }

  hideCSVImportModal() {
    document.getElementById('csv-help-modal').classList.add('hidden');
  }

  handleCSVFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target.result;
        const result = this.parseCSV(csvText);

        if (!result.doctors || result.doctors.length === 0) {
          alert('CSVファイルからデータを読み込めませんでした。\nフォーマットを確認してください。');
          return;
        }

        this.showCSVPreview(result);
      } catch (error) {
        alert('CSVファイルの読み込みに失敗しました:\n' + error.message);
        console.error(error);
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    // ヘッダー行をスキップ(Google Formの場合は1行目がタイムスタンプ等のヘッダー)
    const dataLines = lines.slice(1);
    const doctors = [];
    const requests = {}; // doctorId -> date string[]

    const weekdayMap = {
      '日': 0, '月': 1, '火': 2, '水': 3, '木': 4, '金': 5, '土': 6,
      '日曜日': 0, '月曜日': 1, '火曜日': 2, '水曜日': 3, '木曜日': 4, '金曜日': 5, '土曜日': 6
    };

    dataLines.forEach((line, index) => {
      try {
        // CSVの各行をパース(カンマ区切り、ダブルクォート対応)
        const values = this.parseCSVLine(line);

        // A:名前, B:NG希望日, C:NG通年, D:日直数, E:当直数
        if (values.length < 5) {
          console.warn(`行 ${index + 2}: データが不足しています`);
          return;
        }

        const name = values[0]?.trim();
        const specificNgDatesStr = values[1]?.trim() || '';
        const ngWeekdaysStr = values[2]?.trim() || '';
        const annualDayShifts = parseInt(values[3]) || 0;
        const annualNightShifts = parseInt(values[4]) || 0;

        if (!name) {
          console.warn(`行 ${index + 2}: 名前が空です`);
          return;
        }

        const id = this.generateId();

        // 1. 通年NG曜日のパース
        const ngWeekdays = [];
        if (ngWeekdaysStr) {
          const weekdayStrings = ngWeekdaysStr.split(/[,、;]/).map(s => s.trim());
          weekdayStrings.forEach(dayStr => {
            if (weekdayMap.hasOwnProperty(dayStr)) {
              ngWeekdays.push(weekdayMap[dayStr]);
            }
          });
        }

        // 2. NG希望日（特定日）のパース
        if (specificNgDatesStr) {
          const dateStrings = specificNgDatesStr.split(/[,、;]/).map(s => s.trim());
          requests[id] = [];

          dateStrings.forEach(dateStr => {
            if (dateStr.match(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/)) {
              const formattedDate = dateStr.replace(/\//g, '-');
              const date = new Date(formattedDate);
              if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                requests[id].push(`${year}-${month}-${day}`);
              }
            }
          });
        }

        doctors.push({
          id,
          name,
          annualDayShifts,
          annualNightShifts,
          ngWeekdays: [...new Set(ngWeekdays)]
        });
      } catch (error) {
        console.error(`行 ${index + 2} のパースエラー:`, error);
      }
    });

    return { doctors, requests };
  }

  parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);

    return values.map(v => v.trim());
  }

  showCSVPreview({ doctors, requests }) {
    const previewContainer = document.getElementById('csv-preview-container');
    const preview = document.getElementById('csv-preview');

    const weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];

    let html = `
      <p style="margin-bottom: 1rem; font-weight: 600; color: var(--primary-700);">
        ${doctors.length}人の医師データが見つかりました
      </p>
      <table class="stats-table" style="font-size: 0.875rem;">
        <thead>
          <tr>
            <th>名前</th>
            <th>NG希望日</th>
            <th>NG曜日(通年)</th>
            <th>日直/当直</th>
          </tr>
        </thead>
        <tbody>
    `;

    doctors.forEach(doctor => {
      const ngDays = doctor.ngWeekdays.map(d => weekdayNames[d]).join(', ') || 'なし';
      const requestCount = requests[doctor.id] ? requests[doctor.id].length : 0;

      html += `
        <tr>
          <td><strong>${this.escapeHtml(doctor.name)}</strong></td>
          <td>${requestCount}件</td>
          <td>${ngDays}</td>
          <td>${doctor.annualDayShifts} / ${doctor.annualNightShifts}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
      <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
        <button id="confirm-csv-import" class="btn btn-success">
          ✅ ${doctors.length}人をインポート
        </button>
      </div>
    `;

    preview.innerHTML = html;
    previewContainer.style.display = 'block';

    // インポート確認ボタンのイベントリスナー
    const confirmBtn = document.getElementById('confirm-csv-import');
    const newConfirmBtn = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

    newConfirmBtn.addEventListener('click', () => {
      this.importDoctors(doctors, requests);
    });
  }

  importDoctors(newDoctors, newRequests) {
    const existingNames = this.doctors.map(d => d.name);
    const duplicates = newDoctors.filter(d => existingNames.includes(d.name));

    if (duplicates.length > 0) {
      const confirmMsg = `以下の医師は既に登録されています:\n${duplicates.map(d => d.name).join(', ')}\n\n重複する医師も含めてインポートしますか？\n(「キャンセル」で重複を除外してインポート)`;
      if (!confirm(confirmMsg)) {
        // 重複を除外
        newDoctors = newDoctors.filter(d => !existingNames.includes(d.name));
      }
    }

    if (newDoctors.length === 0) {
      alert('インポートする医師がいません');
      return;
    }

    // 医師データの追加
    this.doctors.push(...newDoctors);

    // リクエストデータの結合
    if (newRequests) {
      Object.keys(newRequests).forEach(doctorId => {
        if (newRequests[doctorId] && newRequests[doctorId].length > 0) {
          // 日付文字列 (YYYY-MM-DD) から YYYY-MM を抽出してグループ化
          newRequests[doctorId].forEach(dateStr => {
            const yearMonth = dateStr.slice(0, 7);

            if (!this.monthlyRequests[doctorId]) {
              this.monthlyRequests[doctorId] = {};
            }
            if (!this.monthlyRequests[doctorId][yearMonth]) {
              this.monthlyRequests[doctorId][yearMonth] = [];
            }

            if (!this.monthlyRequests[doctorId][yearMonth].includes(dateStr)) {
              this.monthlyRequests[doctorId][yearMonth].push(dateStr);
            }
          });
        }
      });
    }

    this.saveData();
    this.renderDoctorList();
    this.hideCSVImportModal();

    alert(`${newDoctors.length}人の医師データと関連リクエストをインポートしました!`);
  }

  // ========================================
  // 月別リクエスト
  // ========================================

  showRequestModal(doctorId) {
    const doctor = this.doctors.find(d => d.id === doctorId);
    if (!doctor) return;

    this.requestingDoctorId = doctorId;
    document.getElementById('request-doctor-name').textContent = doctor.name;

    // タブ初期化
    this.switchRequestTab('ng');

    const yearMonth = `${this.selectedYear}-${String(this.currentMonth).padStart(2, '0')}`;
    const existingRequests = this.monthlyRequests[doctorId]?.[yearMonth] || [];

    const container = document.getElementById('request-dates-container');
    const daysInMonth = new Date(this.selectedYear, this.currentMonth, 0).getDate();

    let html = '<div class="flex gap-sm" style="flex-wrap: wrap;">';

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.selectedYear, this.currentMonth - 1, day);
      const dateStr = this.formatDate(date);
      const isChecked = existingRequests.includes(dateStr);
      const dayOfWeek = date.getDay();
      const color = dayOfWeek === 0 ? 'color:var(--danger-600);' : (dayOfWeek === 6 ? 'color:var(--primary-600);' : '');

      html += `
        <label style="display: flex; align-items: center; gap: 4px; min-width: 50px; padding: 4px; border: 1px solid var(--gray-200); border-radius: 4px; cursor: pointer; background: white;">
          <input type="checkbox" value="${dateStr}" class="request-date" ${isChecked ? 'checked' : ''}>
          <span style="${color}">${day}日</span>
        </label>
      `;
    }

    html += '</div>';
    container.innerHTML = html;

    // 強制割り当て用の一時データ作成（対象月のみ）
    this.tempForceShifts = {};
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.selectedYear, this.currentMonth - 1, day);
      const dateStr = this.formatDate(date);
      if (this.shifts[dateStr]) {
        this.tempForceShifts[dateStr] = { ...this.shifts[dateStr] };
      } else {
        this.tempForceShifts[dateStr] = {};
      }
    }

    document.getElementById('request-modal').classList.remove('hidden');
  }

  switchRequestTab(tabName) {
    const ngBtn = document.getElementById('tab-btn-ng');
    const forceBtn = document.getElementById('tab-btn-force');

    const resetStyle = (btn) => {
      btn.classList.remove('active');
      btn.style.borderBottomColor = 'transparent';
      btn.style.color = 'var(--text-secondary)';
    };

    const activeStyle = (btn) => {
      btn.classList.add('active');
      btn.style.borderBottomColor = 'var(--primary-500)';
      btn.style.color = 'var(--primary-700)';
    };

    resetStyle(ngBtn);
    resetStyle(forceBtn);
    document.getElementById('tab-ng').classList.add('hidden');
    document.getElementById('tab-force').classList.add('hidden');

    if (tabName === 'ng') {
      activeStyle(ngBtn);
      document.getElementById('tab-ng').classList.remove('hidden');
    } else {
      activeStyle(forceBtn);
      document.getElementById('tab-force').classList.remove('hidden');
      this.renderForceCalendar();
    }
  }

  renderForceCalendar() {
    const container = document.getElementById('force-dates-container');
    const daysInMonth = new Date(this.selectedYear, this.currentMonth, 0).getDate();
    const typeInputs = document.getElementsByName('force-type');
    let shiftType = 'night';
    for (const input of typeInputs) { if (input.checked) shiftType = input.value; }

    const shiftKey = shiftType === 'day' ? 'dayShift' : 'nightShift';
    const lockKey = shiftType === 'day' ? 'dayLocked' : 'nightLocked';

    let html = '';

    // 曜日ヘッダーは省略（カレンダーと同じグリッド感）

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(this.selectedYear, this.currentMonth - 1, day);
      const dateStr = this.formatDate(date);
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = this.isHoliday(date);

      const shiftData = this.tempForceShifts[dateStr] || {};
      const currentDoctor = shiftData[shiftKey];
      const isLocked = shiftData[lockKey]; // boolean

      // 状態判定
      let bgClass = 'bg-white';
      let borderClass = 'border-gray-200';

      // 平日の日直は選択不可（または無効）
      const isDisabled = (shiftType === 'day' && !isWeekend && !isHoliday);

      if (isDisabled) {
        bgClass = 'bg-gray-100';
      } else if (currentDoctor === this.requestingDoctorId && isLocked) {
        // 自分自身でロック済み
        bgClass = 'bg-primary-100 border-primary-500';
        borderClass = 'border-primary-500';
      } else if (isLocked && currentDoctor) {
        // 他の医師でロック済み
        bgClass = 'bg-gray-200';
      }

      const dayColor = dayOfWeek === 0 ? 'color:var(--danger-600);' : (dayOfWeek === 6 ? 'color:var(--primary-600);' : '');
      const cursor = isDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
      const onClick = isDisabled ? '' : `onclick="app.toggleForceShift('${dateStr}')"`;

      html += `
        <div class="${bgClass} border ${borderClass} ${cursor}" ${onClick} 
             style="height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 4px; transition: all 0.2s;">
          <span style="${dayColor}; font-weight: 500;">${day}</span>
          ${(currentDoctor === this.requestingDoctorId && isLocked) ? '<span style="font-size:0.8rem; margin-left:2px;">📌</span>' : ''}
        </div>
      `;
    }

    container.innerHTML = html;
  }

  toggleForceShift(dateStr) {
    const typeInputs = document.getElementsByName('force-type');
    let shiftType = 'night';
    for (const input of typeInputs) { if (input.checked) shiftType = input.value; }

    const shiftKey = shiftType === 'day' ? 'dayShift' : 'nightShift';
    const lockKey = shiftType === 'day' ? 'dayLocked' : 'nightLocked';

    const shiftData = this.tempForceShifts[dateStr];

    // 現在の状態
    const currentDoctor = shiftData[shiftKey];
    const isLocked = shiftData[lockKey];

    if (isLocked && currentDoctor && currentDoctor !== this.requestingDoctorId) {
      alert('他の医師で固定されています');
      return;
    }

    if (currentDoctor === this.requestingDoctorId && isLocked) {
      // 解除
      delete shiftData[shiftKey];
      delete shiftData[lockKey];
    } else {
      // 固定
      shiftData[shiftKey] = this.requestingDoctorId;
      shiftData[lockKey] = true;
    }

    this.renderForceCalendar();
  }

  hideRequestModal() {
    document.getElementById('request-modal').classList.add('hidden');
    this.requestingDoctorId = null;
    this.tempForceShifts = null;
  }

  saveMonthlyRequest() {
    const yearMonth = `${this.selectedYear}-${String(this.currentMonth).padStart(2, '0')}`;
    const selectedDates = Array.from(document.querySelectorAll('.request-date:checked'))
      .map(cb => cb.value);

    // NGリクエスト保存
    if (!this.monthlyRequests[this.requestingDoctorId]) {
      this.monthlyRequests[this.requestingDoctorId] = {};
    }
    this.monthlyRequests[this.requestingDoctorId][yearMonth] = selectedDates;

    // 強制割り当て保存
    if (this.tempForceShifts) {
      Object.keys(this.tempForceShifts).forEach(dateStr => {
        this.shifts[dateStr] = this.tempForceShifts[dateStr];
      });
    }

    this.saveData();
    this.hideRequestModal();
    this.renderCalendar(); // カレンダー更新（強制割り当て変更反映）
    this.renderDoctorList(); // NG日程表示更新
    alert('設定を保存しました');
  }

  // ========================================
  // シフト編集
  // ========================================

  editShift(dateStr, shiftType) {
    const availableDoctors = this.getAvailableDoctors(dateStr, shiftType);

    if (availableDoctors.length === 0) {
      alert('割り当て可能な医師がいません');
      return;
    }

    const currentShiftData = this.shifts[dateStr] || {};
    const lockKey = shiftType === 'day' ? 'dayLocked' : 'nightLocked';
    const shiftKey = shiftType === 'day' ? 'dayShift' : 'nightShift';

    const currentDoctor = currentShiftData[shiftKey];
    const isLocked = currentShiftData[lockKey] || false;

    const currentDoctorName = currentDoctor
      ? this.doctors.find(d => d.id === currentDoctor)?.name
      : 'なし';

    let options = '<option value="">割り当てなし</option>';
    availableDoctors.forEach(doctor => {
      const selected = doctor.id === currentDoctor ? 'selected' : '';
      options += `<option value="${doctor.id}" ${selected}>${this.escapeHtml(doctor.name)}</option>`;
    });

    const shiftTypeName = shiftType === 'day' ? '日直' : '当直';
    const html = `
      <div style="padding: 1rem;">
        <p style="margin-bottom: 1rem;"><strong>${dateStr}</strong> の ${shiftTypeName}</p>
        <p style="margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-secondary);">現在: ${this.escapeHtml(currentDoctorName)}</p>
        
        <div style="margin-bottom: 1rem;">
          <label class="form-label">医師を選択</label>
          <select id="shift-doctor-select" class="form-select">
            ${options}
          </select>
        </div>

        <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem;">
          <input type="checkbox" id="shift-lock-check" ${isLocked ? 'checked' : ''}>
          <label for="shift-lock-check" style="cursor: pointer; font-size: 0.9rem;">
            このシフトを固定する<br>
            <span style="font-size: 0.8rem; color: var(--text-tertiary);">※自動割り当てで上書きされなくなります</span>
          </label>
        </div>

        <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
          <button id="cancel-shift-edit" class="btn btn-secondary btn-sm">キャンセル</button>
          <button id="save-shift-edit" class="btn btn-primary btn-sm">保存</button>
        </div>
      </div>
    `;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal" style="max-width: 400px;">${html}</div>`;
    document.body.appendChild(modal);

    modal.querySelector('#cancel-shift-edit').addEventListener('click', () => {
      modal.remove();
    });

    modal.querySelector('#save-shift-edit').addEventListener('click', () => {
      const selectedDoctorId = modal.querySelector('#shift-doctor-select').value;
      const shouldLock = modal.querySelector('#shift-lock-check').checked;

      if (!this.shifts[dateStr]) {
        this.shifts[dateStr] = {};
      }

      if (selectedDoctorId) {
        this.shifts[dateStr][shiftKey] = selectedDoctorId;
        this.shifts[dateStr][lockKey] = shouldLock;
      } else {
        delete this.shifts[dateStr][shiftKey];
        delete this.shifts[dateStr][lockKey];
      }

      this.saveData();
      this.renderCalendar();
      this.renderDoctorList();
      modal.remove();
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  }

  // ========================================
  // 自動割り当て
  // ========================================

  autoAssignShifts() {
    const year = this.getTargetYear(this.selectedYear, this.currentMonth);
    const month = this.currentMonth;
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;

    if (this.monthlyLocks[yearMonth]) {
      alert('この月はロックされているため、自動割り当てを実行できません。\n先にロックを解除してください。');
      return;
    }

    if (!confirm('現在の月のシフトを自動割り当てしますか?\n固定（ロック）されていない割り当ては上書きされます。')) {
      return;
    }

    const daysInMonth = new Date(year, month, 0).getDate();

    // 現在の月のシフトをクリア（固定されていないものだけ）
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);

      if (this.shifts[dateStr]) {
        if (!this.shifts[dateStr].dayLocked) {
          delete this.shifts[dateStr].dayShift;
        }
        if (!this.shifts[dateStr].nightLocked) {
          delete this.shifts[dateStr].nightShift;
        }
      } else {
        this.shifts[dateStr] = {};
      }
    }

    // 各医師の残りコマ数を計算（この時点で固定シフト分はカウントされている）
    const doctorQuotas = this.doctors.map(doctor => {
      const assigned = this.getDoctorAssignedShifts(doctor.id);
      return {
        id: doctor.id,
        remainingDayShifts: Math.max(0, doctor.annualDayShifts - assigned.dayShifts),
        remainingNightShifts: Math.max(0, doctor.annualNightShifts - assigned.nightShifts)
      };
    });

    // 日付ごとに割り当て
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);
      const dayOfWeek = date.getDay();
      const isHoliday = this.isHoliday(date);

      // 前日の当直医を取得（連続勤務防止用）
      // 前日が前月の場合も考慮してDateオブジェクトから計算
      const prevDate = new Date(year, month - 1, day - 1);
      const prevDateStr = this.formatDate(prevDate);
      const prevNightDoctorId = this.shifts[prevDateStr]?.nightShift;

      if (!this.shifts[dateStr]) {
        this.shifts[dateStr] = {};
      }

      // 休日は日直も割り当て
      if (isHoliday && !this.shifts[dateStr].dayShift) {
        const availableDoctors = this.getAvailableDoctors(dateStr, 'day');

        // 優先度フィルタリング
        // 1. 前日の当直医を避ける
        let candidates = availableDoctors;
        if (prevNightDoctorId) {
          const filtered = candidates.filter(d => d.id !== prevNightDoctorId);
          if (filtered.length > 0) {
            candidates = filtered;
          }
        }

        const sortedDoctors = candidates
          .map(doctor => {
            const quota = doctorQuotas.find(q => q.id === doctor.id);
            return { doctor, remaining: quota.remainingDayShifts };
          })
          .filter(item => item.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining);

        if (sortedDoctors.length > 0) {
          const maxRemaining = sortedDoctors[0].remaining;
          const candidates = sortedDoctors.filter(d => d.remaining === maxRemaining);
          const selected = candidates[Math.floor(Math.random() * candidates.length)];

          this.shifts[dateStr].dayShift = selected.doctor.id;
          const quota = doctorQuotas.find(q => q.id === selected.doctor.id);
          quota.remainingDayShifts--;
        }
      }

      // 当直を割り当て
      if (!this.shifts[dateStr].nightShift) {
        const availableDoctors = this.getAvailableDoctors(dateStr, 'night');
        const currentDayDoctorId = this.shifts[dateStr]?.dayShift;

        // 優先度フィルタリング
        // 1. 前日の当直医を避ける
        let candidates = availableDoctors;
        if (prevNightDoctorId) {
          const filtered = candidates.filter(d => d.id !== prevNightDoctorId);
          if (filtered.length > 0) {
            candidates = filtered;
          }
        }

        // 2. 当日の日直医を避ける（日当直の連続を回避）
        if (currentDayDoctorId) {
          const filtered = candidates.filter(d => d.id !== currentDayDoctorId);
          if (filtered.length > 0) {
            candidates = filtered;
          }
        }

        const sortedDoctors = candidates
          .map(doctor => {
            const quota = doctorQuotas.find(q => q.id === doctor.id);
            return { doctor, remaining: quota.remainingNightShifts };
          })
          .filter(item => item.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining);

        if (sortedDoctors.length > 0) {
          const maxRemaining = sortedDoctors[0].remaining;
          const candidates = sortedDoctors.filter(d => d.remaining === maxRemaining);
          const selected = candidates[Math.floor(Math.random() * candidates.length)];

          this.shifts[dateStr].nightShift = selected.doctor.id;
          const quota = doctorQuotas.find(q => q.id === selected.doctor.id);
          quota.remainingNightShifts--;
        }
      }
    }

    this.saveData();
    this.renderCalendar();
    this.renderDoctorList();
    alert('自動割り当てが完了しました');
  }

  autoAssignAnnualShifts() {
    if (!confirm(`${this.selectedYear}年度（4月〜翌3月）の全期間を一括で自動割り当てしますか？\n固定（ロック）されていない割り当ては全て上書きされます。\n※処理に数秒かかる場合があります。`)) {
      return;
    }

    const fiscalYear = this.selectedYear;
    const skippedMonths = [];

    // 4月〜12月
    for (let m = 4; m <= 12; m++) {
      if (!this.assignShiftsForMonth(fiscalYear, m)) {
        skippedMonths.push(`${m}月`);
      }
    }
    // 翌1月〜3月
    for (let m = 1; m <= 3; m++) {
      if (!this.assignShiftsForMonth(fiscalYear + 1, m)) {
        skippedMonths.push(`${m}月`);
      }
    }

    this.saveData();
    this.renderCalendar();
    this.renderDoctorList();
    this.calculateAnnualStats();

    let msg = '年間一括割り当てが完了しました。';
    if (skippedMonths.length > 0) {
      msg += `\n以下の月はロックされているためスキップしました: ${skippedMonths.join(', ')}`;
    }
    alert(msg);
  }

  assignShiftsForMonth(year, month) {
    const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
    if (this.monthlyLocks[yearMonth]) return false;

    const daysInMonth = new Date(year, month, 0).getDate();

    // シフトクリア（固定以外）
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);

      if (this.shifts[dateStr]) {
        if (!this.shifts[dateStr].dayLocked) delete this.shifts[dateStr].dayShift;
        if (!this.shifts[dateStr].nightLocked) delete this.shifts[dateStr].nightShift;
      } else {
        this.shifts[dateStr] = {};
      }
    }

    // 残り枠計算（ループごとに再計算が必要）
    const doctorQuotas = this.doctors.map(doctor => {
      const assigned = this.getDoctorAssignedShifts(doctor.id);
      return {
        id: doctor.id,
        remainingDayShifts: Math.max(0, doctor.annualDayShifts - assigned.dayShifts),
        remainingNightShifts: Math.max(0, doctor.annualNightShifts - assigned.nightShifts)
      };
    });

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);
      const dayOfWeek = date.getDay();
      const isHoliday = this.isHoliday(date);

      const prevDate = new Date(year, month - 1, day - 1);
      const prevDateStr = this.formatDate(prevDate);
      const prevNightDoctorId = this.shifts[prevDateStr]?.nightShift;

      // 日直割り当て
      if (isHoliday && !this.shifts[dateStr].dayShift) {
        const availableDoctors = this.getAvailableDoctors(dateStr, 'day');

        let candidates = availableDoctors;
        if (prevNightDoctorId) {
          const filtered = candidates.filter(d => d.id !== prevNightDoctorId);
          if (filtered.length > 0) candidates = filtered;
        }

        const sortedDoctors = candidates
          .map(doctor => {
            const quota = doctorQuotas.find(q => q.id === doctor.id);
            return { doctor, remaining: quota.remainingDayShifts };
          })
          .filter(item => item.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining);

        if (sortedDoctors.length > 0) {
          const maxRemaining = sortedDoctors[0].remaining;
          const candidates = sortedDoctors.filter(d => d.remaining === maxRemaining);
          const selected = candidates[Math.floor(Math.random() * candidates.length)];

          this.shifts[dateStr].dayShift = selected.doctor.id;
          const quota = doctorQuotas.find(q => q.id === selected.doctor.id);
          quota.remainingDayShifts--;
        }
      }

      // 当直割り当て
      if (!this.shifts[dateStr].nightShift) {
        const availableDoctors = this.getAvailableDoctors(dateStr, 'night');
        const currentDayDoctorId = this.shifts[dateStr]?.dayShift;

        let candidates = availableDoctors;
        if (prevNightDoctorId) {
          const filtered = candidates.filter(d => d.id !== prevNightDoctorId);
          if (filtered.length > 0) candidates = filtered;
        }

        if (currentDayDoctorId) {
          const filtered = candidates.filter(d => d.id !== currentDayDoctorId);
          if (filtered.length > 0) candidates = filtered;
        }

        const sortedDoctors = candidates
          .map(doctor => {
            const quota = doctorQuotas.find(q => q.id === doctor.id);
            return { doctor, remaining: quota.remainingNightShifts };
          })
          .filter(item => item.remaining > 0)
          .sort((a, b) => b.remaining - a.remaining);

        if (sortedDoctors.length > 0) {
          const maxRemaining = sortedDoctors[0].remaining;
          const candidates = sortedDoctors.filter(d => d.remaining === maxRemaining);
          const selected = candidates[Math.floor(Math.random() * candidates.length)];

          this.shifts[dateStr].nightShift = selected.doctor.id;
          const quota = doctorQuotas.find(q => q.id === selected.doctor.id);
          quota.remainingNightShifts--;
        }
      }
    }
    return true;
  }

  // ========================================
  // ヘルパー関数
  // ========================================

  getAvailableDoctors(dateStr, shiftType) {
    const date = new Date(dateStr);
    const dayOfWeek = date.getDay();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    return this.doctors.filter(doctor => {
      // 年間NGの曜日チェック
      if (doctor.ngWeekdays.includes(dayOfWeek)) {
        return false;
      }

      // 月別リクエストチェック
      const monthlyNGDates = this.monthlyRequests[doctor.id]?.[yearMonth] || [];
      if (monthlyNGDates.includes(dateStr)) {
        return false;
      }

      return true;
    });
  }

  getDoctorAssignedShifts(doctorId) {
    let dayShifts = 0;
    let nightShifts = 0;

    // 年度範囲: selectedYearの4/1から翌年の3/31まで
    // 文字列比較で判定 (YYYY-MM-DD)
    const startDate = `${this.selectedYear}-04-01`;
    const endDate = `${this.selectedYear + 1}-03-31`;

    Object.keys(this.shifts).forEach(dateStr => {
      if (dateStr < startDate || dateStr > endDate) {
        return;
      }

      const shift = this.shifts[dateStr];
      if (shift.dayShift === doctorId) dayShifts++;
      if (shift.nightShift === doctorId) nightShifts++;
    });

    return { dayShifts, nightShifts };
  }

  toggleHoliday(dateStr) {
    const parts = dateStr.split('-');
    const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const currentlyHoliday = this.isHoliday(date);

    this.customHolidays[dateStr] = !currentlyHoliday;
    this.saveData();
    this.renderCalendar();
  }

  isHolidayDefault(date) {
    // 簡易的な祝日判定（実際には祝日APIを使用することを推奨）
    const holidays = [
      '01-01', // 元日
      '01-02', // 正月休み
      '01-03', // 正月休み
      '02-11', // 建国記念の日
      '02-23', // 天皇誕生日
      '03-20', // 春分の日（概算）
      '04-29', // 昭和の日
      '05-03', // 憲法記念日
      '05-04', // みどりの日
      '05-05', // こどもの日
      '07-03', // 海の日（概算）
      '08-11', // 山の日
      '09-23', // 秋分の日（概算）
      '10-14', // スポーツの日（概算）
      '11-03', // 文化の日
      '11-23', // 勤労感謝の日
      '12-30', // 年末休み
      '12-31', // 大晦日
    ];

    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return holidays.includes(monthDay);
  }

  isHoliday(date) {
    const dateStr = this.formatDate(date);
    if (this.customHolidays && this.customHolidays[dateStr] !== undefined) {
      return this.customHolidays[dateStr];
    }
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true;
    return this.isHolidayDefault(date);
  }

  formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========================================
  // エクスポート
  // ========================================

  exportToCSV() {
    const year = this.selectedYear;
    const month = this.currentMonth;
    const daysInMonth = new Date(year, month, 0).getDate();

    let csv = '\uFEFF'; // BOM for Excel
    csv += '日付,曜日,日直,当直\n';

    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month - 1, day);
      const dateStr = this.formatDate(date);
      const dayOfWeek = weekdays[date.getDay()];

      const dayShiftDoctor = this.shifts[dateStr]?.dayShift;
      const nightShiftDoctor = this.shifts[dateStr]?.nightShift;

      const dayShiftName = dayShiftDoctor
        ? this.doctors.find(d => d.id === dayShiftDoctor)?.name || 'BLANK'
        : 'BLANK';

      const nightShiftName = nightShiftDoctor
        ? this.doctors.find(d => d.id === nightShiftDoctor)?.name || 'BLANK'
        : 'BLANK';

      csv += `${dateStr},${dayOfWeek},${dayShiftName},${nightShiftName}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shift_${year}_${String(month).padStart(2, '0')}.csv`;
    link.click();
  }

  // ========================================
  // PWA (デスクトップアプリ化)
  // ========================================

  setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // Chrome 67以前でミニ情報バーが自動表示されるのを防ぐ
      e.preventDefault();
      // イベントを保存しておく
      this.deferredPrompt = e;

      // インストールバナーを表示
      this.showInstallBanner();
    });

    // 「インストール」ボタンがクリックされたとき
    document.getElementById('install-button').addEventListener('click', async () => {
      this.promptInstall();
    });

    // 「後で」ボタンがクリックされたとき
    document.getElementById('dismiss-install').addEventListener('click', () => {
      document.getElementById('install-banner').classList.add('hidden');
      // ヘッダーのインストールボタンを表示
      document.getElementById('show-install-info').style.display = 'block';
    });

    // ヘッダーの「インストール」ボタン
    document.getElementById('show-install-info').addEventListener('click', () => {
      if (this.deferredPrompt) {
        this.promptInstall();
      } else {
        alert('現在、このブラウザではインストールがサポートされていないか、既にインストールされています。');
      }
    });

    // インストール完了時のイベント
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      document.getElementById('install-banner').classList.add('hidden');
      document.getElementById('show-install-info').style.display = 'none';
      console.log('PWA was installed');
    });
  }

  showInstallBanner() {
    const banner = document.getElementById('install-banner');
    banner.classList.remove('hidden');
  }

  async promptInstall() {
    if (!this.deferredPrompt) return;

    // プロンプトを表示
    this.deferredPrompt.prompt();

    // ユーザーの反応を待つ
    const { outcome } = await this.deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);

    // インストールされた場合、プロンプトを破棄
    // (一度しか使えないため)
    this.deferredPrompt = null;

    // バナーを隠す
    document.getElementById('install-banner').classList.add('hidden');
  }
}

// ========================================
// アプリケーション起動
// ========================================

window.app = new ShiftManagementApp();
