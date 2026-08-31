/* ==========================================================================
   IGP ADMIN CRM PORTAL - FRONTEND JAVASCRIPT APP LOGIC
   ========================================================================== */

const API_BASE = ''; // Relative path for API endpoints

// Global App State
let currentAdminToken = localStorage.getItem('igp_admin_token') || null;
let allLeadsData = [];
let allAppsData = [];
let allSubscribersData = [];
let activeLeadFilter = 'All';
let activeAppFilter = 'All';

// API Helper with Auth Headers
async function apiFetch(endpoint, options = {}) {
  options.headers = options.headers || {};
  if (currentAdminToken) {
    options.headers['Authorization'] = `Bearer ${currentAdminToken}`;
  }
  if (!(options.body instanceof FormData) && !options.headers['Content-Type']) {
    options.headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(API_BASE + endpoint, options);
  if (response.status === 401) {
    handleLogout();
    throw new Error('Session expired. Please log in again.');
  }
  return response.json();
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check text-cyan' : 'fa-circle-exclamation text-error'}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// Toggle Password Visibility
function togglePasswordVisibility(fieldId, btn) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  const isPass = input.type === 'password';
  input.type = isPass ? 'text' : 'password';
  btn.innerHTML = `<i class="fa-solid ${isPass ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuthSession();
});

function setupEventListeners() {
  // Login Form
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  // Logout Button
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Sidebar Menu Navigation
  const menuItems = document.querySelectorAll('.menu-item');
  menuItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = item.getAttribute('data-tab');
      switchTab(tabId);
    });
  });

  // Direct Email Form
  const directEmailForm = document.getElementById('directEmailForm');
  if (directEmailForm) {
    directEmailForm.addEventListener('submit', handleDirectEmailSubmit);
  }

  // Change Password Form
  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', handleChangePassword);
  }
}

// Auth Verification
async function checkAuthSession() {
  const loginScreen = document.getElementById('loginScreen');
  const adminApp = document.getElementById('adminApp');

  if (!currentAdminToken) {
    loginScreen.classList.remove('hidden');
    adminApp.classList.add('hidden');
    return;
  }

  try {
    const res = await apiFetch('/api/admin/me');
    if (res.success) {
      document.getElementById('currentAdminEmail').innerText = res.admin.email;
      loginScreen.classList.add('hidden');
      adminApp.classList.remove('hidden');
      refreshDashboardData();
    } else {
      handleLogout();
    }
  } catch (err) {
    handleLogout();
  }
}

// Login Handler
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitBtn = document.getElementById('loginSubmitBtn');
  const alertBox = document.getElementById('loginErrorAlert');

  alertBox.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Authenticating...`;

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then(r => r.json());

    if (res.success && res.token) {
      currentAdminToken = res.token;
      localStorage.setItem('igp_admin_token', res.token);
      showToast('Logged in successfully!');
      checkAuthSession();
    } else {
      document.getElementById('loginErrorMsg').innerText = res.error || 'Invalid email or password.';
      alertBox.classList.remove('hidden');
    }
  } catch (err) {
    document.getElementById('loginErrorMsg').innerText = 'Network error connecting to backend.';
    alertBox.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span class="btn-text">Log In to CRM</span> <i class="fa-solid fa-arrow-right btn-icon"></i>`;
  }
}

// Logout Handler
function handleLogout() {
  currentAdminToken = null;
  localStorage.removeItem('igp_admin_token');
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('adminApp').classList.add('hidden');
  showToast('Logged out of Admin CRM.', 'error');
}

// Tab Switching Handler
function switchTab(tabId) {
  const panels = document.querySelectorAll('.tab-panel');
  const menuItems = document.querySelectorAll('.menu-item');

  panels.forEach(p => p.classList.remove('active'));
  menuItems.forEach(m => m.classList.remove('active'));

  const targetPanel = document.getElementById(tabId);
  const targetMenu = document.querySelector(`.menu-item[data-tab="${tabId}"]`);

  if (targetPanel) targetPanel.classList.add('active');
  if (targetMenu) targetMenu.classList.add('active');

  // Update Page Title
  const titles = {
    overviewTab: { title: 'Overview Dashboard', sub: 'Real-time metrics, leads and candidate workflow' },
    leadsTab: { title: 'Consultation Leads CRM', sub: 'Manage and follow up with EV infrastructure client leads' },
    applicationsTab: { title: 'Job Applicants CRM', sub: 'Review engineering candidate profiles, resumes and pipeline' },
    subscribersTab: { title: 'Newsletter Subscribers', sub: 'Subscribed users list and CSV export' },
    emailTab: { title: 'Resend Email Dispatch Center', sub: 'Dispatch emails via Resend.com API and view delivery logs' },
    settingsTab: { title: 'CRM & Account Settings', sub: 'Manage admin credentials and mail service status' }
  };

  if (titles[tabId]) {
    document.getElementById('pageTitle').innerText = titles[tabId].title;
    document.getElementById('pageSub').innerText = titles[tabId].sub;
  }
}

// Refresh Dashboard Data
async function refreshDashboardData() {
  await Promise.all([
    loadOverviewStats(),
    loadLeadsData(),
    loadApplicationsData(),
    loadSubscribersData(),
    loadEmailLogs()
  ]);
  showToast('CRM data synchronized.');
}

/* ==========================================================================
   DATA LOADING & RENDERING
   ========================================================================== */

// 1. Overview Stats
async function loadOverviewStats() {
  try {
    const res = await apiFetch('/api/admin/stats');
    if (res.success) {
      document.getElementById('statTotalLeads').innerText = res.stats.totalLeads;
      document.getElementById('statNewLeadsBadge').innerText = `${res.stats.newLeads} New Enquiries`;
      document.getElementById('statTotalApplications').innerText = res.stats.totalApplications;
      document.getElementById('statTotalSubscribers').innerText = res.stats.totalSubscribers;
      document.getElementById('statTotalEmailsSent').innerText = res.stats.totalEmailsSent;

      document.getElementById('sidebarNewLeadsBadge').innerText = res.stats.newLeads;
      if (res.stats.newLeads > 0) {
        document.getElementById('sidebarNewLeadsBadge').classList.remove('hidden');
      } else {
        document.getElementById('sidebarNewLeadsBadge').classList.add('hidden');
      }
      document.getElementById('sidebarAppsCount').innerText = res.stats.totalApplications;

      renderOverviewLeads(res.recentLeads);
      renderOverviewApps(res.recentApplications);
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

function renderOverviewLeads(leads) {
  const tbody = document.getElementById('overviewLeadsTable');
  if (!leads || leads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No leads received yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => `
    <tr>
      <td><strong>${escapeHtml(l.name)}</strong></td>
      <td>${escapeHtml(l.email)}<br><small class="text-muted">${escapeHtml(l.phone)}</small></td>
      <td>${formatDate(l.created_at)}</td>
      <td><span class="badge status-${l.status.replace(/\s+/g, '-')}">${l.status}</span></td>
    </tr>
  `).join('');
}

function renderOverviewApps(apps) {
  const tbody = document.getElementById('overviewAppsTable');
  if (!apps || apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">No applications submitted yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = apps.map(a => `
    <tr>
      <td><strong>${escapeHtml(a.full_name)}</strong></td>
      <td>${escapeHtml(a.job_title)}<br><small class="text-muted">${escapeHtml(a.department)}</small></td>
      <td>${formatDate(a.created_at)}</td>
      <td><span class="badge status-${a.status.replace(/\s+/g, '-')}">${a.status}</span></td>
    </tr>
  `).join('');
}

// 2. Leads CRM
async function loadLeadsData() {
  try {
    const res = await apiFetch('/api/admin/leads');
    if (res.success) {
      allLeadsData = res.leads;
      renderLeadsTable();
    }
  } catch (err) {
    console.error('Error loading leads:', err);
  }
}

function filterLeads(status, btn) {
  activeLeadFilter = status;
  const pills = btn.parentElement.querySelectorAll('.pill-btn');
  pills.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderLeadsTable();
}

function handleLeadSearch() {
  renderLeadsTable();
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');
  const search = document.getElementById('leadSearchInput').value.toLowerCase().trim();

  let filtered = allLeadsData;
  if (activeLeadFilter !== 'All') {
    filtered = filtered.filter(l => l.status === activeLeadFilter);
  }
  if (search) {
    filtered = filtered.filter(l => 
      l.name.toLowerCase().includes(search) ||
      l.email.toLowerCase().includes(search) ||
      l.phone.toLowerCase().includes(search) ||
      l.query.toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted">No leads matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(l => `
    <tr>
      <td>#${l.id}</td>
      <td><strong>${escapeHtml(l.name)}</strong></td>
      <td>
        <a href="mailto:${escapeHtml(l.email)}" class="text-cyan">${escapeHtml(l.email)}</a><br>
        <small class="text-muted"><i class="fa-solid fa-phone"></i> ${escapeHtml(l.phone)}</small>
      </td>
      <td><div style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(l.query)}</div></td>
      <td>${formatDate(l.created_at)}</td>
      <td><span class="badge status-${l.status.replace(/\s+/g, '-')}">${l.status}</span></td>
      <td class="text-right">
        <button class="btn-icon-action" onclick="openLeadModal(${l.id})" title="View Details / Update Status">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn-icon-action" onclick="quickEmailLead('${escapeHtml(l.email)}')" title="Send Email via Resend">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
        <button class="btn-icon-action delete-action" onclick="deleteLead(${l.id})" title="Delete Entry">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function openLeadModal(leadId) {
  const lead = allLeadsData.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('modalLeadId').value = lead.id;
  document.getElementById('modalLeadName').innerText = lead.name;
  document.getElementById('modalLeadEmail').innerText = lead.email;
  document.getElementById('modalLeadPhone').innerText = lead.phone;
  document.getElementById('modalLeadDate').innerText = formatDate(lead.created_at);
  document.getElementById('modalLeadQuery').innerText = lead.query;
  document.getElementById('modalLeadStatus').value = lead.status;
  document.getElementById('modalLeadNotes').value = lead.notes || '';

  document.getElementById('leadModal').classList.remove('hidden');
}

function closeLeadModal() {
  document.getElementById('leadModal').classList.add('hidden');
}

async function saveLeadChanges() {
  const id = document.getElementById('modalLeadId').value;
  const status = document.getElementById('modalLeadStatus').value;
  const notes = document.getElementById('modalLeadNotes').value;

  try {
    const res = await apiFetch(`/api/admin/leads/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });

    if (res.success) {
      showToast('Lead updated successfully!');
      closeLeadModal();
      loadOverviewStats();
      loadLeadsData();
    }
  } catch (err) {
    showToast('Failed to update lead.', 'error');
  }
}

async function deleteLead(leadId) {
  if (!confirm('Are you sure you want to delete this lead?')) return;
  try {
    const res = await apiFetch(`/api/admin/leads/${leadId}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Lead deleted.');
      loadOverviewStats();
      loadLeadsData();
    }
  } catch (err) {
    showToast('Failed to delete lead.', 'error');
  }
}

function quickEmailLead(email) {
  switchTab('emailTab');
  document.getElementById('emailToInput').value = email;
  document.getElementById('emailSubjectInput').value = 'Regarding your IGP Consultation Enquiry';
}

function openLeadEmailComposer() {
  const email = document.getElementById('modalLeadEmail').innerText;
  closeLeadModal();
  quickEmailLead(email);
}

// 3. Applications CRM
async function loadApplicationsData() {
  try {
    const res = await apiFetch('/api/admin/applications');
    if (res.success) {
      allAppsData = res.applications;
      renderAppsTable();
    }
  } catch (err) {
    console.error('Error loading applications:', err);
  }
}

function filterApps(status, btn) {
  activeAppFilter = status;
  const pills = btn.parentElement.querySelectorAll('.pill-btn');
  pills.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderAppsTable();
}

function handleAppSearch() {
  renderAppsTable();
}

function renderAppsTable() {
  const tbody = document.getElementById('appsTableBody');
  const search = document.getElementById('appSearchInput').value.toLowerCase().trim();

  let filtered = allAppsData;
  if (activeAppFilter !== 'All') {
    filtered = filtered.filter(a => a.status === activeAppFilter);
  }
  if (search) {
    filtered = filtered.filter(a => 
      a.full_name.toLowerCase().includes(search) ||
      a.email.toLowerCase().includes(search) ||
      a.job_title.toLowerCase().includes(search) ||
      a.department.toLowerCase().includes(search)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No applications matching filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td>#${a.id}</td>
      <td><strong>${escapeHtml(a.full_name)}</strong></td>
      <td>${escapeHtml(a.job_title)}<br><small class="text-muted">${escapeHtml(a.department)}</small></td>
      <td>
        <a href="mailto:${escapeHtml(a.email)}" class="text-cyan">${escapeHtml(a.email)}</a><br>
        <small class="text-muted"><i class="fa-solid fa-phone"></i> ${escapeHtml(a.phone)}</small>
      </td>
      <td>
        <a href="/uploads/${escapeHtml(a.resume_path)}" target="_blank" class="btn-secondary btn-sm">
          <i class="fa-solid fa-file-arrow-down"></i> Resume
        </a>
      </td>
      <td>${formatDate(a.created_at)}</td>
      <td><span class="badge status-${a.status.replace(/\s+/g, '-')}">${a.status}</span></td>
      <td class="text-right">
        <button class="btn-icon-action" onclick="openAppModal(${a.id})" title="View Profile & Resume">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="btn-icon-action" onclick="quickEmailLead('${escapeHtml(a.email)}')" title="Send Candidate Email via Resend">
          <i class="fa-solid fa-paper-plane"></i>
        </button>
        <button class="btn-icon-action delete-action" onclick="deleteApp(${a.id})" title="Delete Application">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function openAppModal(appId) {
  const appRecord = allAppsData.find(a => a.id === appId);
  if (!appRecord) return;

  document.getElementById('modalAppId').value = appRecord.id;
  document.getElementById('modalAppName').innerText = appRecord.full_name;
  document.getElementById('modalAppTitle').innerText = appRecord.job_title;
  document.getElementById('modalAppDept').innerText = appRecord.department;
  document.getElementById('modalAppEmail').innerText = appRecord.email;
  document.getElementById('modalAppPhone').innerText = appRecord.phone;
  document.getElementById('modalAppDate').innerText = formatDate(appRecord.created_at);
  document.getElementById('modalAppIntro').innerText = appRecord.intro || 'No intro provided.';
  document.getElementById('modalAppStatus').value = appRecord.status;
  document.getElementById('modalAppNotes').value = appRecord.notes || '';

  const linkedinBtn = document.getElementById('modalAppLinkedIn');
  if (appRecord.linkedin_url) {
    linkedinBtn.href = appRecord.linkedin_url;
    document.getElementById('modalLinkedInBox').classList.remove('hidden');
  } else {
    document.getElementById('modalLinkedInBox').classList.add('hidden');
  }

  const resumeBtn = document.getElementById('modalAppResumeBtn');
  resumeBtn.href = `/uploads/${appRecord.resume_path}`;
  document.getElementById('modalAppResumeName').innerText = appRecord.resume_originalname;

  document.getElementById('appModal').classList.remove('hidden');
}

function closeAppModal() {
  document.getElementById('appModal').classList.add('hidden');
}

async function saveAppChanges() {
  const id = document.getElementById('modalAppId').value;
  const status = document.getElementById('modalAppStatus').value;
  const notes = document.getElementById('modalAppNotes').value;

  try {
    const res = await apiFetch(`/api/admin/applications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes })
    });

    if (res.success) {
      showToast('Candidate application updated!');
      closeAppModal();
      loadOverviewStats();
      loadApplicationsData();
    }
  } catch (err) {
    showToast('Failed to update application.', 'error');
  }
}

async function deleteApp(appId) {
  if (!confirm('Are you sure you want to delete this job application and resume file?')) return;
  try {
    const res = await apiFetch(`/api/admin/applications/${appId}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Application deleted.');
      loadOverviewStats();
      loadApplicationsData();
    }
  } catch (err) {
    showToast('Failed to delete application.', 'error');
  }
}

function openCandidateEmailComposer() {
  const email = document.getElementById('modalAppEmail').innerText;
  closeAppModal();
  quickEmailLead(email);
}

// 4. Subscribers List
async function loadSubscribersData() {
  try {
    const res = await apiFetch('/api/admin/subscribers');
    if (res.success) {
      allSubscribersData = res.subscribers;
      renderSubscribersTable();
    }
  } catch (err) {
    console.error('Error loading subscribers:', err);
  }
}

function renderSubscribersTable() {
  const tbody = document.getElementById('subscribersTableBody');
  if (allSubscribersData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No subscribers found.</td></tr>`;
    return;
  }

  tbody.innerHTML = allSubscribersData.map(s => `
    <tr>
      <td>#${s.id}</td>
      <td><strong>${escapeHtml(s.email)}</strong></td>
      <td>${escapeHtml(s.source)}</td>
      <td>${formatDate(s.created_at)}</td>
      <td><span class="badge badge-success">${s.status}</span></td>
      <td class="text-right">
        <button class="btn-icon-action delete-action" onclick="deleteSubscriber(${s.id})" title="Remove Subscriber">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

async function deleteSubscriber(subId) {
  if (!confirm('Remove subscriber from list?')) return;
  try {
    const res = await apiFetch(`/api/admin/subscribers/${subId}`, { method: 'DELETE' });
    if (res.success) {
      showToast('Subscriber removed.');
      loadOverviewStats();
      loadSubscribersData();
    }
  } catch (err) {
    showToast('Failed to delete subscriber.', 'error');
  }
}

// 5. Resend Email Dispatch Center
async function loadEmailLogs() {
  try {
    const res = await apiFetch('/api/admin/email-logs');
    if (res.success) {
      renderEmailLogsTable(res.logs);
    }
  } catch (err) {
    console.error('Error loading email logs:', err);
  }
}

function renderEmailLogsTable(logs) {
  const tbody = document.getElementById('emailLogsTableBody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No email dispatches logged yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(l => `
    <tr>
      <td><strong>${escapeHtml(l.recipient)}</strong></td>
      <td>${escapeHtml(l.subject)}</td>
      <td><span class="badge badge-neutral">${escapeHtml(l.type)}</span></td>
      <td>${formatDate(l.created_at)}</td>
      <td><code class="code-box">${escapeHtml(l.resend_id.substring(0, 14))}...</code></td>
    </tr>
  `).join('');
}

function applyEmailTemplate(presetKey) {
  const subjectInput = document.getElementById('emailSubjectInput');
  const bodyInput = document.getElementById('emailBodyInput');

  const templates = {
    consultation: {
      subject: 'Scheduled Consultation - IGP India EV Solutions',
      body: `<p>Dear Client,</p><p>Thank you for expressing interest in India Growth Partner's EV charging infrastructure services.</p><p>We would like to schedule a 20-minute technical consultation call with our senior engineering team.</p><p>Best regards,<br>Team IGP India</p>`
    },
    interview: {
      subject: 'Interview Invitation - IGP Careers',
      body: `<p>Dear Candidate,</p><p>Thank you for applying to IGP by Sparklehood. We are impressed by your qualifications and would like to invite you for an interview.</p><p>Please reply with your available time slots over the coming week.</p><p>Best regards,<br>Talent Team | IGP India</p>`
    },
    app_update: {
      subject: 'Application Status Update - IGP India',
      body: `<p>Dear Applicant,</p><p>We wanted to provide you with an update regarding your application for the engineering role at IGP.</p><p>Best regards,<br>Team IGP India</p>`
    },
    newsletter: {
      subject: 'Latest EV Infrastructure Updates from IGP India',
      body: `<h2>IGP India Insights</h2><p>Here are the latest updates on EV charging technology, field deployment, and fleet optimization across India.</p>`
    }
  };

  if (templates[presetKey]) {
    subjectInput.value = templates[presetKey].subject;
    bodyInput.value = templates[presetKey].body;
  }
}

async function handleDirectEmailSubmit(e) {
  e.preventDefault();
  const to = document.getElementById('emailToInput').value.trim();
  const subject = document.getElementById('emailSubjectInput').value.trim();
  const html = document.getElementById('emailBodyInput').value.trim();
  const submitBtn = document.getElementById('sendEmailBtn');

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending via Resend API...`;

  try {
    const res = await apiFetch('/api/admin/send-email', {
      method: 'POST',
      body: JSON.stringify({ to, subject, html })
    });

    if (res.success) {
      showToast('Email successfully sent via Resend API!');
      document.getElementById('directEmailForm').reset();
      loadEmailLogs();
      loadOverviewStats();
    } else {
      showToast(res.error || 'Failed to send email.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error dispatching email.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Email via Resend.com API`;
  }
}

// 6. Security Settings
async function handleChangePassword(e) {
  e.preventDefault();
  const oldPassword = document.getElementById('oldPasswordInput').value;
  const newPassword = document.getElementById('newPasswordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/admin/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });

    if (res.success) {
      showToast('Password updated successfully!');
      document.getElementById('changePasswordForm').reset();
    } else {
      showToast(res.error || 'Password update failed.', 'error');
    }
  } catch (err) {
    showToast(err.message || 'Error updating password.', 'error');
  }
}

/* ==========================================================================
   CSV EXPORT UTILITIES
   ========================================================================== */

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportLeadsCSV() {
  if (allLeadsData.length === 0) return showToast('No leads data to export.', 'error');
  let csv = 'ID,Name,Email,Phone,Source,Status,Query,Date\n';
  allLeadsData.forEach(l => {
    csv += `"${l.id}","${escapeCsv(l.name)}","${escapeCsv(l.email)}","${escapeCsv(l.phone)}","${escapeCsv(l.source)}","${escapeCsv(l.status)}","${escapeCsv(l.query)}","${l.created_at}"\n`;
  });
  downloadCSV(csv, `IGP_Leads_${Date.now()}.csv`);
}

function exportAppsCSV() {
  if (allAppsData.length === 0) return showToast('No applicants data to export.', 'error');
  let csv = 'ID,Candidate,Email,Phone,Position,Department,LinkedIn,Status,Date\n';
  allAppsData.forEach(a => {
    csv += `"${a.id}","${escapeCsv(a.full_name)}","${escapeCsv(a.email)}","${escapeCsv(a.phone)}","${escapeCsv(a.job_title)}","${escapeCsv(a.department)}","${escapeCsv(a.linkedin_url)}","${escapeCsv(a.status)}","${a.created_at}"\n`;
  });
  downloadCSV(csv, `IGP_Applicants_${Date.now()}.csv`);
}

function exportSubscribersCSV() {
  if (allSubscribersData.length === 0) return showToast('No subscribers to export.', 'error');
  let csv = 'ID,Email,Source,Status,Date\n';
  allSubscribersData.forEach(s => {
    csv += `"${s.id}","${escapeCsv(s.email)}","${escapeCsv(s.source)}","${escapeCsv(s.status)}","${s.created_at}"\n`;
  });
  downloadCSV(csv, `IGP_Subscribers_${Date.now()}.csv`);
}

// Helpers
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

function escapeCsv(str) {
  if (!str) return '';
  return String(str).replace(/"/g, '""');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function openEmailModal() {
  switchTab('emailTab');
}
