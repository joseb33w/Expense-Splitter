import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ========================================
// CONFIG
// ========================================
const SUPABASE_URL = 'https://xhhmxabftbyxrirvvihn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_NZHoIxqqpSvVBP8MrLHCYA_gmg1AbN-';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TB_USERS = 'uNMexs7BYTXQ2_expense-splitter_app_users';
const TB_GROUPS = 'uNMexs7BYTXQ2_expense-splitter_groups';
const TB_MEMBERS = 'uNMexs7BYTXQ2_expense-splitter_members';
const TB_EXPENSES = 'uNMexs7BYTXQ2_expense-splitter_expenses';
const BUCKET = 'uNMexs7BYTXQ2_expense-splitter_receipts';
const EXCHANGE_API = 'https://open.er-api.com/v6/latest/USD';

// ========================================
// STATE
// ========================================
let currentUser = null;
let displayName = '';
let groups = [];
let selectedGroupId = null;
let selectedGroupMembers = [];
let expenses = [];
let allExpenses = [];
let exchangeRates = null;
let ratesFetchedAt = 0;
let currentCategoryFilter = 'all';
let selectedReceiptFile = null;
let categoryChart = null;
let monthlyChart = null;
let editingGroupId = null;

// ========================================
// SAFE DOM HELPER
// ========================================
function el(id) {
  var e = document.getElementById(id);
  return e;
}

function esc(str) {
  var d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

function showError(id, msg) {
  var box = el(id);
  if (box) {
    box.textContent = msg;
    box.classList.remove('hidden');
  }
}

function formatDate(d) {
  if (!d) return '';
  var dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ========================================
// INIT
// ========================================
try {
  setTimeout(function() {
    var ls = el('loading-screen');
    if (ls) ls.classList.add('hidden');
    initAuth();
  }, 1800);
} catch(e) {
  console.error('Init error:', e.message);
}

async function initAuth() {
  try {
    var result = await supabase.auth.getUser();
    var user = result.data.user;
    if (user) {
      currentUser = user;
      await ensureAppUser(user);
      showApp();
    } else {
      showScreen('signup');
    }
  } catch(e) {
    console.error('Auth init error:', e.message);
    showScreen('signup');
  }
}

// ========================================
// SCREEN NAV
// ========================================
function showScreen(name) {
  var screens = ['signup', 'checkemail', 'signin', 'app'];
  screens.forEach(function(s) {
    var elem = el('screen-' + s);
    if (elem) elem.classList.add('hidden');
  });
  var target = el('screen-' + name);
  if (target) target.classList.remove('hidden');
}

// ========================================
// AUTH - SIGN UP
// ========================================
var signupForm = el('signup-form');
if (signupForm) {
  signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var nameVal = el('su-name').value.trim();
    var emailVal = el('su-email').value.trim();
    var passVal = el('su-pass').value;
    var errBox = el('su-error');
    if (errBox) errBox.classList.add('hidden');

    try {
      var res = await supabase.auth.signUp({
        email: emailVal,
        password: passVal,
        options: {
          emailRedirectTo: 'https://sling-gogiapp.web.app/email-confirmed.html',
          data: { display_name: nameVal }
        }
      });

      if (res.error) {
        var msg = res.error.message || '';
        if (msg.indexOf('already') !== -1 || msg.indexOf('registered') !== -1) {
          var signIn = await supabase.auth.signInWithPassword({ email: emailVal, password: passVal });
          if (signIn.error) {
            showError('su-error', 'Incorrect password for existing account.');
            return;
          }
          currentUser = signIn.data.user;
          displayName = nameVal;
          await ensureAppUser(signIn.data.user, nameVal);
          showApp();
          return;
        }
        showError('su-error', msg);
        return;
      }

      displayName = nameVal;
      var confirmEl = el('confirm-email');
      if (confirmEl) confirmEl.textContent = emailVal;
      showScreen('checkemail');
    } catch(err) {
      showError('su-error', 'Something went wrong. Please try again.');
    }
  });
}

// ========================================
// AUTH - SIGN IN
// ========================================
var signinForm = el('signin-form');
if (signinForm) {
  signinForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var emailVal = el('si-email').value.trim();
    var passVal = el('si-pass').value;
    var errBox = el('si-error');
    if (errBox) errBox.classList.add('hidden');

    try {
      var res = await supabase.auth.signInWithPassword({ email: emailVal, password: passVal });
      if (res.error) {
        var msg = res.error.message || '';
        if (msg.indexOf('not confirmed') !== -1 || msg.indexOf('Email not confirmed') !== -1) {
          showError('si-error', 'Please check your email and click the confirmation link first.');
        } else {
          showError('si-error', msg);
        }
        return;
      }
      currentUser = res.data.user;
      await ensureAppUser(res.data.user);
      showApp();
    } catch(err) {
      showError('si-error', 'Something went wrong. Please try again.');
    }
  });
}

// ========================================
// AUTH - NAV LINKS
// ========================================
var linkSignin = el('link-signin');
if (linkSignin) linkSignin.addEventListener('click', function(e) { e.preventDefault(); showScreen('signin'); });

var linkSignup = el('link-signup');
if (linkSignup) linkSignup.addEventListener('click', function(e) { e.preventDefault(); showScreen('signup'); });

var btnGoSignin = el('btn-go-signin');
if (btnGoSignin) btnGoSignin.addEventListener('click', function() { showScreen('signin'); });

// ========================================
// ENSURE APP USER
// ========================================
async function ensureAppUser(user, name) {
  try {
    var res = await supabase.from(TB_USERS).select('*').eq('user_id', user.id).maybeSingle();
    if (!res.data) {
      var n = name || displayName || (user.user_metadata ? user.user_metadata.display_name : '') || user.email.split('@')[0];
      await supabase.from(TB_USERS).insert({
        user_id: user.id,
        email: user.email,
        display_name: n
      });
      displayName = n;
    } else {
      displayName = res.data.display_name || user.email.split('@')[0];
    }
  } catch(e) {
    console.error('ensureAppUser error:', e.message);
    displayName = user.email.split('@')[0];
  }
}

// ========================================
// SHOW APP
// ========================================
function showApp() {
  showScreen('app');
  var greetEl = el('nav-user');
  if (greetEl) greetEl.textContent = displayName;
  loadGroups();
  fetchExchangeRates();
  setupRealtime();
  loadAllExpensesForDashboard();
}

// ========================================
// LOGOUT
// ========================================
var btnLogout = el('btn-logout');
if (btnLogout) {
  btnLogout.addEventListener('click', async function() {
    try {
      await supabase.auth.signOut();
      currentUser = null;
      displayName = '';
      groups = [];
      selectedGroupId = null;
      expenses = [];
      allExpenses = [];
      showScreen('signin');
      toast('Logged out', 'success');
    } catch(e) {
      toast('Logout failed', 'error');
    }
  });
}

// ========================================
// TABS
// ========================================
document.querySelectorAll('.tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.tab').forEach(function(b) { b.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
    btn.classList.add('active');
    var panelId = 'panel-' + btn.getAttribute('data-t');
    var panel = el(panelId);
    if (panel) panel.classList.add('active');

    var tabName = btn.getAttribute('data-t');
    if (tabName === 'settle' && selectedGroupId) {
      calculateSettlement();
    }
    if (tabName === 'dashboard') {
      loadAllExpensesForDashboard();
    }
  });
});

// ========================================
// EXCHANGE RATES
// ========================================
async function fetchExchangeRates() {
  var now = Date.now();
  if (exchangeRates && (now - ratesFetchedAt) < 3600000) return;
  try {
    var resp = await fetch(EXCHANGE_API);
    var json = await resp.json();
    if (json.rates) {
      exchangeRates = json.rates;
      ratesFetchedAt = now;
    }
  } catch(e) {
    console.error('Exchange rate fetch error:', e.message);
  }
}

function convertToUSD(amount, currency) {
  if (!currency || currency === 'USD') return amount;
  if (!exchangeRates || !exchangeRates[currency]) return amount;
  return amount / exchangeRates[currency];
}

// ========================================
// GROUPS - LOAD & RENDER
// ========================================
async function loadGroups() {
  try {
    var res = await supabase.from(TB_GROUPS).select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    groups = res.data || [];
    renderGroups();
    renderGroupSelector();
    updateDashboardGroupCount();
  } catch(e) {
    console.error('Load groups error:', e.message);
  }
}

function renderGroups() {
  var container = el('groups-list');
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No groups yet</h3><p>Create your first group to start splitting</p></div>';
    return;
  }

  container.innerHTML = groups.map(function(g) {
    var isSelected = g.id === selectedGroupId;
    return '<div class="group-card' + (isSelected ? ' selected' : '') + '">' +
      '<div class="g-icon"><i class="fas fa-users"></i></div>' +
      '<div class="g-info" onclick="window._selectGroup(\'' + g.id + '\')">' +
        '<div class="g-name">' + esc(g.name) + '</div>' +
        '<div class="g-meta"><span>' + formatDate(g.created_at) + '</span></div>' +
      '</div>' +
      '<div class="group-actions">' +
        '<button class="icon-btn" onclick="window._editGroup(\'' + g.id + '\')"><i class="fas fa-pen"></i></button>' +
        '<button class="icon-btn danger" onclick="window._deleteGroup(\'' + g.id + '\')"><i class="fas fa-trash"></i></button>' +
      '</div>' +
      (isSelected ? '<i class="fas fa-check-circle group-check"></i>' : '') +
    '</div>';
  }).join('');
}

function renderGroupSelector() {
  var sel = el('expense-group');
  if (!sel) return;
  var opts = '<option value="">Select group...</option>';
  groups.forEach(function(g) {
    var s = g.id === selectedGroupId ? ' selected' : '';
    opts += '<option value="' + g.id + '"' + s + '>' + esc(g.name) + '</option>';
  });
  sel.innerHTML = opts;
}

// ========================================
// GROUP SELECTION
// ========================================
window._selectGroup = async function(id) {
  selectedGroupId = id;
  renderGroups();
  renderGroupSelector();
  await loadGroupMembers(id);
  await loadExpenses();

  // Show expenses view
  var noGroup = el('no-group-selected');
  var expView = el('expenses-view');
  if (noGroup) noGroup.classList.add('hidden');
  if (expView) expView.classList.remove('hidden');

  var noSettle = el('no-group-settle');
  var settleView = el('settle-view');
  if (noSettle) noSettle.classList.add('hidden');
  if (settleView) settleView.classList.remove('hidden');

  var grp = groups.find(function(g) { return g.id === id; });
  var nameEl = el('exp-group-name');
  if (nameEl && grp) nameEl.innerHTML = '<i class="fas fa-receipt"></i> ' + esc(grp.name);
  var subEl = el('exp-group-sub');
  if (subEl) subEl.textContent = selectedGroupMembers.length + ' members';
  var settleNameEl = el('settle-group-name');
  if (settleNameEl && grp) settleNameEl.innerHTML = '<i class="fas fa-balance-scale"></i> ' + esc(grp.name);
};

async function loadGroupMembers(groupId) {
  try {
    var res = await supabase.from(TB_MEMBERS).select('*').eq('group_id', groupId);
    if (res.error) throw res.error;
    selectedGroupMembers = res.data || [];
    renderPaidBySelector();
    renderCustomSplitInputs();
  } catch(e) {
    console.error('Load members error:', e.message);
    selectedGroupMembers = [];
  }
}

function renderPaidBySelector() {
  var sel = el('exp-paid-by');
  if (!sel) return;
  var opts = '<option value="">Who paid?</option>';
  selectedGroupMembers.forEach(function(m) {
    opts += '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>';
  });
  sel.innerHTML = opts;
}

// ========================================
// CREATE GROUP
// ========================================
var btnNewGroup = el('btn-new-group');
if (btnNewGroup) {
  btnNewGroup.addEventListener('click', function() {
    var form = el('new-group-form');
    if (form) form.classList.toggle('hidden');
  });
}

var btnAddMember = el('btn-add-member');
if (btnAddMember) {
  btnAddMember.addEventListener('click', function() {
    var container = el('members-inputs');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = '<i class="fas fa-user"></i><input type="text" class="member-input" placeholder="Member name" required>';
    container.appendChild(div);
  });
}

var btnCancelGroup = el('btn-cancel-group');
if (btnCancelGroup) {
  btnCancelGroup.addEventListener('click', function() {
    var form = el('new-group-form');
    if (form) form.classList.add('hidden');
  });
}

var btnSaveGroup = el('btn-save-group');
if (btnSaveGroup) {
  btnSaveGroup.addEventListener('click', async function() {
    var nameInput = el('group-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!name) { toast('Enter a group name', 'error'); return; }

    var memberInputs = document.querySelectorAll('#members-inputs .member-input');
    var members = [];
    memberInputs.forEach(function(inp) {
      var v = inp.value.trim();
      if (v) members.push(v);
    });
    if (members.length < 2) { toast('Add at least 2 members', 'error'); return; }

    try {
      var res = await supabase.from(TB_GROUPS).insert({ name: name }).select().single();
      if (res.error) throw res.error;

      var groupId = res.data.id;
      var memberRows = members.map(function(m) {
        return { group_id: groupId, name: m };
      });
      var mRes = await supabase.from(TB_MEMBERS).insert(memberRows);
      if (mRes.error) throw mRes.error;

      toast('Group created!', 'success');
      if (nameInput) nameInput.value = '';
      var container = el('members-inputs');
      if (container) container.innerHTML = '<div class="field"><i class="fas fa-user"></i><input type="text" class="member-input" placeholder="Member name" required></div>';
      var form = el('new-group-form');
      if (form) form.classList.add('hidden');
      await loadGroups();
      window._selectGroup(groupId);
    } catch(e) {
      toast('Failed to create group: ' + e.message, 'error');
    }
  });
}

// ========================================
// EDIT GROUP
// ========================================
window._editGroup = async function(id) {
  editingGroupId = id;
  var grp = groups.find(function(g) { return g.id === id; });
  if (!grp) return;

  var editForm = el('edit-group-form');
  if (editForm) editForm.classList.remove('hidden');

  var nameInput = el('edit-group-name');
  if (nameInput) nameInput.value = grp.name;

  // Load members for this group
  try {
    var res = await supabase.from(TB_MEMBERS).select('*').eq('group_id', id);
    var members = res.data || [];
    var container = el('edit-members-inputs');
    if (container) {
      container.innerHTML = members.map(function(m) {
        return '<div class="field"><i class="fas fa-user"></i><input type="text" class="edit-member-input" value="' + esc(m.name) + '" placeholder="Member name"></div>';
      }).join('');
    }
  } catch(e) {
    console.error('Load edit members error:', e.message);
  }
};

var btnEditAddMember = el('btn-edit-add-member');
if (btnEditAddMember) {
  btnEditAddMember.addEventListener('click', function() {
    var container = el('edit-members-inputs');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = '<i class="fas fa-user"></i><input type="text" class="edit-member-input" placeholder="Member name">';
    container.appendChild(div);
  });
}

var btnCancelEditGroup = el('btn-cancel-edit-group');
if (btnCancelEditGroup) {
  btnCancelEditGroup.addEventListener('click', function() {
    var form = el('edit-group-form');
    if (form) form.classList.add('hidden');
    editingGroupId = null;
  });
}

var btnSaveEditGroup = el('btn-save-edit-group');
if (btnSaveEditGroup) {
  btnSaveEditGroup.addEventListener('click', async function() {
    if (!editingGroupId) return;
    var nameInput = el('edit-group-name');
    var name = nameInput ? nameInput.value.trim() : '';
    if (!name) { toast('Enter a group name', 'error'); return; }

    var memberInputs = document.querySelectorAll('#edit-members-inputs .edit-member-input');
    var members = [];
    memberInputs.forEach(function(inp) {
      var v = inp.value.trim();
      if (v) members.push(v);
    });
    if (members.length < 2) { toast('Need at least 2 members', 'error'); return; }

    try {
      // Update group name
      var res = await supabase.from(TB_GROUPS).update({ name: name }).eq('id', editingGroupId);
      if (res.error) throw res.error;

      // Delete old members and insert new
      await supabase.from(TB_MEMBERS).delete().eq('group_id', editingGroupId);
      var memberRows = members.map(function(m) {
        return { group_id: editingGroupId, name: m };
      });
      await supabase.from(TB_MEMBERS).insert(memberRows);

      toast('Group updated!', 'success');
      var form = el('edit-group-form');
      if (form) form.classList.add('hidden');
      editingGroupId = null;
      await loadGroups();
      if (selectedGroupId) {
        await loadGroupMembers(selectedGroupId);
      }
    } catch(e) {
      toast('Failed to update group: ' + e.message, 'error');
    }
  });
}

// ========================================
// DELETE GROUP
// ========================================
window._deleteGroup = async function(id) {
  if (!confirm('Delete this group and all its expenses? This cannot be undone.')) return;
  try {
    // Delete expenses, members, then group
    await supabase.from(TB_EXPENSES).delete().eq('group_id', id);
    await supabase.from(TB_MEMBERS).delete().eq('group_id', id);
    await supabase.from(TB_GROUPS).delete().eq('id', id);

    if (selectedGroupId === id) {
      selectedGroupId = null;
      var noGroup = el('no-group-selected');
      var expView = el('expenses-view');
      if (noGroup) noGroup.classList.remove('hidden');
      if (expView) expView.classList.add('hidden');
      var noSettle = el('no-group-settle');
      var settleView = el('settle-view');
      if (noSettle) noSettle.classList.remove('hidden');
      if (settleView) settleView.classList.add('hidden');
    }

    toast('Group deleted', 'success');
    await loadGroups();
    loadAllExpensesForDashboard();
  } catch(e) {
    toast('Failed to delete group: ' + e.message, 'error');
  }
};

// ========================================
// LOAD EXPENSES
// ========================================
async function loadExpenses() {
  if (!selectedGroupId) return;
  try {
    var res = await supabase.from(TB_EXPENSES).select('*').eq('group_id', selectedGroupId).order('expense_date', { ascending: false });
    if (res.error) throw res.error;
    expenses = res.data || [];
    renderExpenses();
  } catch(e) {
    console.error('Load expenses error:', e.message);
  }
}

function getFilteredExpenses() {
  var filtered = expenses.slice();

  // Category filter
  if (currentCategoryFilter !== 'all') {
    filtered = filtered.filter(function(ex) { return ex.category === currentCategoryFilter; });
  }

  // Search filter
  var searchEl = el('expense-search');
  if (searchEl && searchEl.value.trim()) {
    var q = searchEl.value.trim().toLowerCase();
    filtered = filtered.filter(function(ex) {
      return (ex.description || '').toLowerCase().indexOf(q) !== -1 ||
             (ex.paid_by || '').toLowerCase().indexOf(q) !== -1 ||
             (ex.category || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  // Date range filter
  var fromEl = el('filter-date-from');
  var toEl = el('filter-date-to');
  if (fromEl && fromEl.value) {
    var fromDate = new Date(fromEl.value);
    filtered = filtered.filter(function(ex) {
      return new Date(ex.expense_date) >= fromDate;
    });
  }
  if (toEl && toEl.value) {
    var toDate = new Date(toEl.value);
    toDate.setHours(23, 59, 59, 999);
    filtered = filtered.filter(function(ex) {
      return new Date(ex.expense_date) <= toDate;
    });
  }

  return filtered;
}

function renderExpenses() {
  var container = el('expenses-list');
  if (!container) return;

  var filtered = getFilteredExpenses();

  // Render total bar
  var totalBar = el('expenses-total');
  if (totalBar) {
    var total = 0;
    filtered.forEach(function(ex) {
      total += convertToUSD(Number(ex.amount), ex.currency);
    });
    totalBar.innerHTML = '<div class="total-label"><i class="fas fa-calculator"></i> Total (' + filtered.length + ' expenses)</div><div class="total-amount">$' + total.toFixed(2) + '</div>';
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><h3>No expenses yet</h3><p>Add your first expense to start tracking</p></div>';
    return;
  }

  var catIcons = {
    food: 'fa-utensils', transport: 'fa-car', rent: 'fa-home',
    utilities: 'fa-bolt', entertainment: 'fa-film', other: 'fa-ellipsis-h'
  };

  container.innerHTML = filtered.map(function(ex) {
    var usdAmt = convertToUSD(Number(ex.amount), ex.currency);
    var icon = catIcons[ex.category] || 'fa-receipt';
    var currencyLabel = ex.currency && ex.currency !== 'USD' ? ' (' + ex.currency + ' ' + Number(ex.amount).toFixed(2) + ')' : '';

    return '<div class="expense-card">' +
      '<div class="exp-left">' +
        '<div class="exp-icon cat-' + esc(ex.category || 'other') + '"><i class="fas ' + icon + '"></i></div>' +
        '<div class="exp-info">' +
          '<div class="exp-desc">' + esc(ex.description) + '</div>' +
          '<div class="exp-meta">' +
            '<span><i class="fas fa-user"></i> ' + esc(ex.paid_by) + '</span>' +
            '<span><i class="fas fa-calendar"></i> ' + formatDate(ex.expense_date) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="exp-right">' +
        '<div class="exp-amount">$' + usdAmt.toFixed(2) + currencyLabel + '</div>' +
        '<div class="exp-actions">' +
          '<button class="icon-btn-sm" onclick="window._editExpense(\'' + ex.id + '\')"><i class="fas fa-pen"></i></button>' +
          '<button class="icon-btn-sm danger" onclick="window._deleteExpense(\'' + ex.id + '\')"><i class="fas fa-trash"></i></button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ========================================
// CATEGORY FILTER
// ========================================
document.querySelectorAll('#category-filter .filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#category-filter .filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentCategoryFilter = btn.getAttribute('data-cat');
    renderExpenses();
  });
});

// ========================================
// SEARCH & DATE FILTERS
// ========================================
var searchInput = el('expense-search');
if (searchInput) {
  searchInput.addEventListener('input', function() { renderExpenses(); });
}
var dateFrom = el('filter-date-from');
var dateTo = el('filter-date-to');
if (dateFrom) dateFrom.addEventListener('change', function() { renderExpenses(); });
if (dateTo) dateTo.addEventListener('change', function() { renderExpenses(); });

// ========================================
// CUSTOM SPLIT
// ========================================
var splitMethodSelect = el('split-method');
if (splitMethodSelect) {
  splitMethodSelect.addEventListener('change', function() {
    var customSection = el('custom-split-inputs');
    if (!customSection) return;
    if (this.value === 'custom') {
      customSection.classList.remove('hidden');
      renderCustomSplitInputs();
    } else {
      customSection.classList.add('hidden');
    }
  });
}

function renderCustomSplitInputs() {
  var container = el('custom-split-inputs');
  if (!container) return;
  if (selectedGroupMembers.length === 0) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px;">Select a group first</p>';
    return;
  }
  var equalPct = (100 / selectedGroupMembers.length).toFixed(1);
  container.innerHTML = '<div class="split-header"><span>Member</span><span>%</span></div>' +
    selectedGroupMembers.map(function(m) {
      return '<div class="split-row">' +
        '<span class="split-name">' + esc(m.name) + '</span>' +
        '<div class="field split-field"><input type="number" class="split-pct-input" data-member="' + esc(m.name) + '" value="' + equalPct + '" min="0" max="100" step="0.1"></div>' +
      '</div>';
    }).join('') +
    '<div class="split-total-row"><span>Total:</span><span id="split-total-pct">0%</span></div>';

  // Update total on change
  container.querySelectorAll('.split-pct-input').forEach(function(inp) {
    inp.addEventListener('input', updateSplitTotal);
  });
  updateSplitTotal();
}

function updateSplitTotal() {
  var inputs = document.querySelectorAll('.split-pct-input');
  var total = 0;
  inputs.forEach(function(inp) { total += parseFloat(inp.value) || 0; });
  var totalEl = el('split-total-pct');
  if (totalEl) {
    totalEl.textContent = total.toFixed(1) + '%';
    totalEl.style.color = Math.abs(total - 100) < 0.5 ? 'var(--secondary)' : 'var(--danger)';
  }
}

function getCustomSplits() {
  var splitMethod = el('split-method');
  if (!splitMethod || splitMethod.value !== 'custom') return null;

  var inputs = document.querySelectorAll('.split-pct-input');
  var splits = {};
  var total = 0;
  inputs.forEach(function(inp) {
    var pct = parseFloat(inp.value) || 0;
    splits[inp.getAttribute('data-member')] = pct;
    total += pct;
  });

  if (Math.abs(total - 100) > 1) {
    toast('Split percentages must add up to 100%', 'error');
    return false;
  }
  return splits;
}

function saveCustomSplits(expenseId, splits) {
  if (!splits) return;
  try {
    var key = 'splits_' + expenseId;
    localStorage.setItem(key, JSON.stringify(splits));
  } catch(e) { /* ignore */ }
}

function loadCustomSplits(expenseId) {
  try {
    var key = 'splits_' + expenseId;
    var data = localStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch(e) { return null; }
}

// ========================================
// CREATE / EDIT EXPENSE
// ========================================
var btnNewExpense = el('btn-new-expense');
if (btnNewExpense) {
  btnNewExpense.addEventListener('click', function() {
    resetExpenseForm();
    var form = el('new-expense-form');
    if (form) form.classList.toggle('hidden');
  });
}

function resetExpenseForm() {
  var titleEl = el('expense-form-title');
  if (titleEl) titleEl.innerHTML = '<i class="fas fa-plus-circle"></i> New Expense';
  var editId = el('edit-expense-id');
  if (editId) editId.value = '';

  var desc = el('exp-desc'); if (desc) desc.value = '';
  var amt = el('exp-amount'); if (amt) amt.value = '';
  var curr = el('exp-currency'); if (curr) curr.value = 'USD';
  var paidBy = el('exp-paid-by'); if (paidBy) paidBy.value = '';
  var cat = el('exp-category'); if (cat) cat.value = 'food';
  var dateInp = el('exp-date');
  if (dateInp) dateInp.value = new Date().toISOString().split('T')[0];

  var splitMethod = el('split-method');
  if (splitMethod) splitMethod.value = 'equal';
  var customInputs = el('custom-split-inputs');
  if (customInputs) customInputs.classList.add('hidden');

  selectedReceiptFile = null;
  var preview = el('receipt-preview');
  var placeholder = el('receipt-placeholder');
  if (preview) preview.classList.add('hidden');
  if (placeholder) placeholder.classList.remove('hidden');
}

// Receipt upload
var receiptUpload = el('receipt-upload');
if (receiptUpload) {
  receiptUpload.addEventListener('click', function() {
    var fileInput = el('receipt-file');
    if (fileInput) fileInput.click();
  });
}
var receiptFile = el('receipt-file');
if (receiptFile) {
  receiptFile.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) {
      selectedReceiptFile = file;
      var reader = new FileReader();
      reader.onload = function(ev) {
        var preview = el('receipt-preview');
        var placeholder = el('receipt-placeholder');
        if (preview) { preview.src = ev.target.result; preview.classList.remove('hidden'); }
        if (placeholder) placeholder.classList.add('hidden');
      };
      reader.readAsDataURL(file);
    }
  });
}

var btnCancelExpense = el('btn-cancel-expense');
if (btnCancelExpense) {
  btnCancelExpense.addEventListener('click', function() {
    var form = el('new-expense-form');
    if (form) form.classList.add('hidden');
    resetExpenseForm();
  });
}

var btnSaveExpense = el('btn-save-expense');
if (btnSaveExpense) {
  btnSaveExpense.addEventListener('click', async function() {
    var editId = el('edit-expense-id');
    var isEdit = editId && editId.value;

    var desc = (el('exp-desc') || {}).value || '';
    var amount = parseFloat((el('exp-amount') || {}).value);
    var currency = (el('exp-currency') || {}).value || 'USD';
    var paidBy = (el('exp-paid-by') || {}).value || '';
    var category = (el('exp-category') || {}).value || 'other';
    var expDate = (el('exp-date') || {}).value || '';
    var groupId = selectedGroupId;

    if (!desc.trim()) { toast('Enter a description', 'error'); return; }
    if (!amount || amount <= 0) { toast('Enter a valid amount', 'error'); return; }
    if (!paidBy) { toast('Select who paid', 'error'); return; }
    if (!expDate) { toast('Select a date', 'error'); return; }
    if (!groupId) { toast('Select a group first', 'error'); return; }

    // Check custom splits
    var splits = getCustomSplits();
    if (splits === false) return; // validation error

    try {
      var receiptUrl = null;
      if (selectedReceiptFile) {
        var ext = selectedReceiptFile.name.split('.').pop();
        var path = currentUser.id + '/' + Date.now() + '.' + ext;
        var upRes = await supabase.storage.from(BUCKET).upload(path, selectedReceiptFile);
        if (upRes.error) throw upRes.error;
        var urlRes = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
        receiptUrl = urlRes.data ? urlRes.data.signedUrl : null;
      }

      var expenseData = {
        description: desc.trim(),
        amount: amount,
        currency: currency,
        paid_by: paidBy,
        category: category,
        expense_date: expDate,
        group_id: groupId
      };
      if (receiptUrl) expenseData.receipt_url = receiptUrl;

      var savedId;
      if (isEdit) {
        var res = await supabase.from(TB_EXPENSES).update(expenseData).eq('id', editId.value).select().single();
        if (res.error) throw res.error;
        savedId = editId.value;
        toast('Expense updated!', 'success');
      } else {
        var res = await supabase.from(TB_EXPENSES).insert(expenseData).select().single();
        if (res.error) throw res.error;
        savedId = res.data.id;
        toast('Expense added!', 'success');
      }

      // Save custom splits to localStorage
      if (splits && savedId) {
        saveCustomSplits(savedId, splits);
      }

      var form = el('new-expense-form');
      if (form) form.classList.add('hidden');
      resetExpenseForm();
      await loadExpenses();
      loadAllExpensesForDashboard();

      // Show currency conversion note
      if (currency !== 'USD') {
        var usdAmt = convertToUSD(amount, currency);
        var noteEl = el('converted-note');
        if (noteEl) {
          noteEl.textContent = currency + ' ' + amount.toFixed(2) + ' = ~$' + usdAmt.toFixed(2) + ' USD';
          noteEl.classList.remove('hidden');
          setTimeout(function() { noteEl.classList.add('hidden'); }, 4000);
        }
      }
    } catch(e) {
      toast('Failed to save expense: ' + e.message, 'error');
    }
  });
}

// ========================================
// EDIT EXPENSE
// ========================================
window._editExpense = function(id) {
  var ex = expenses.find(function(e) { return e.id === id; });
  if (!ex) return;

  var form = el('new-expense-form');
  if (form) form.classList.remove('hidden');

  var titleEl = el('expense-form-title');
  if (titleEl) titleEl.innerHTML = '<i class="fas fa-pen"></i> Edit Expense';

  var editId = el('edit-expense-id');
  if (editId) editId.value = id;

  var desc = el('exp-desc'); if (desc) desc.value = ex.description || '';
  var amt = el('exp-amount'); if (amt) amt.value = ex.amount || '';
  var curr = el('exp-currency'); if (curr) curr.value = ex.currency || 'USD';
  var paidBy = el('exp-paid-by'); if (paidBy) paidBy.value = ex.paid_by || '';
  var cat = el('exp-category'); if (cat) cat.value = ex.category || 'other';
  var dateInp = el('exp-date'); if (dateInp) dateInp.value = ex.expense_date || '';

  // Load custom splits if any
  var savedSplits = loadCustomSplits(id);
  if (savedSplits) {
    var splitMethod = el('split-method');
    if (splitMethod) splitMethod.value = 'custom';
    var customInputs = el('custom-split-inputs');
    if (customInputs) customInputs.classList.remove('hidden');
    renderCustomSplitInputs();
    // Set saved values
    setTimeout(function() {
      Object.keys(savedSplits).forEach(function(memberName) {
        var inp = document.querySelector('.split-pct-input[data-member="' + memberName + '"]');
        if (inp) inp.value = savedSplits[memberName];
      });
      updateSplitTotal();
    }, 100);
  }

  // Scroll to form
  form.scrollIntoView({ behavior: 'smooth' });
};

// ========================================
// DELETE EXPENSE
// ========================================
window._deleteExpense = async function(id) {
  if (!confirm('Delete this expense?')) return;
  try {
    var res = await supabase.from(TB_EXPENSES).delete().eq('id', id);
    if (res.error) throw res.error;
    toast('Expense deleted', 'success');
    // Remove custom splits
    try { localStorage.removeItem('splits_' + id); } catch(e) { /* ignore */ }
    await loadExpenses();
    loadAllExpensesForDashboard();
  } catch(e) {
    toast('Failed to delete: ' + e.message, 'error');
  }
};

// ========================================
// SETTLEMENT CALCULATION
// ========================================
function calculateSettlement() {
  if (!selectedGroupId || selectedGroupMembers.length === 0) return;

  var balances = {};
  selectedGroupMembers.forEach(function(m) { balances[m.name] = 0; });

  expenses.forEach(function(ex) {
    var usdAmt = convertToUSD(Number(ex.amount), ex.currency);
    var payer = ex.paid_by;
    if (balances[payer] === undefined) balances[payer] = 0;
    balances[payer] += usdAmt;

    // Check custom splits
    var customSplits = loadCustomSplits(ex.id);
    if (customSplits) {
      Object.keys(customSplits).forEach(function(member) {
        if (balances[member] === undefined) balances[member] = 0;
        balances[member] -= usdAmt * (customSplits[member] / 100);
      });
    } else {
      // Equal split
      var perPerson = usdAmt / selectedGroupMembers.length;
      selectedGroupMembers.forEach(function(m) {
        balances[m.name] -= perPerson;
      });
    }
  });

  // Render balances
  var balContainer = el('balances-list');
  if (balContainer) {
    balContainer.innerHTML = Object.keys(balances).map(function(name) {
      var bal = balances[name];
      var isPositive = bal > 0.01;
      var isNegative = bal < -0.01;
      var cls = isPositive ? 'positive' : (isNegative ? 'negative' : 'neutral');
      var label = isPositive ? 'is owed' : (isNegative ? 'owes' : 'settled');
      return '<div class="balance-card ' + cls + '">' +
        '<div class="bal-name"><i class="fas fa-user-circle"></i> ' + esc(name) + '</div>' +
        '<div class="bal-info">' +
          '<span class="bal-label">' + label + '</span>' +
          '<span class="bal-amount">$' + Math.abs(bal).toFixed(2) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Calculate settlements (simplified)
  var debtors = [];
  var creditors = [];
  Object.keys(balances).forEach(function(name) {
    if (balances[name] < -0.01) debtors.push({ name: name, amount: -balances[name] });
    if (balances[name] > 0.01) creditors.push({ name: name, amount: balances[name] });
  });

  debtors.sort(function(a, b) { return b.amount - a.amount; });
  creditors.sort(function(a, b) { return b.amount - a.amount; });

  var settlements = [];
  var di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    var payment = Math.min(debtors[di].amount, creditors[ci].amount);
    if (payment > 0.01) {
      settlements.push({
        from: debtors[di].name,
        to: creditors[ci].name,
        amount: payment
      });
    }
    debtors[di].amount -= payment;
    creditors[ci].amount -= payment;
    if (debtors[di].amount < 0.01) di++;
    if (creditors[ci].amount < 0.01) ci++;
  }

  var settleContainer = el('settlements-list');
  if (settleContainer) {
    if (settlements.length === 0) {
      settleContainer.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All settled up!</h3><p>No payments needed</p></div>';
    } else {
      settleContainer.innerHTML = settlements.map(function(s) {
        return '<div class="settle-card">' +
          '<div class="settle-from"><i class="fas fa-user"></i> ' + esc(s.from) + '</div>' +
          '<div class="settle-arrow"><i class="fas fa-arrow-right"></i></div>' +
          '<div class="settle-to"><i class="fas fa-user"></i> ' + esc(s.to) + '</div>' +
          '<div class="settle-amount">$' + s.amount.toFixed(2) + '</div>' +
        '</div>';
      }).join('');
    }
  }
}

// ========================================
// DASHBOARD
// ========================================
async function loadAllExpensesForDashboard() {
  try {
    var res = await supabase.from(TB_EXPENSES).select('*').order('expense_date', { ascending: false });
    if (res.error) throw res.error;
    allExpenses = res.data || [];
    updateDashboardCards();
    updateDashboardCharts();
  } catch(e) {
    console.error('Load dashboard expenses error:', e.message);
  }
}

function updateDashboardGroupCount() {
  var countEl = el('dash-group-count');
  if (countEl) countEl.textContent = groups.length;
}

function updateDashboardCards() {
  var totalSpent = 0;
  var youOwe = 0;
  var owedToYou = 0;

  // Calculate totals across all groups
  allExpenses.forEach(function(ex) {
    var usdAmt = convertToUSD(Number(ex.amount), ex.currency);
    totalSpent += usdAmt;
  });

  var totalEl = el('dash-total-spent');
  if (totalEl) totalEl.textContent = '$' + totalSpent.toFixed(2);

  // You owe / owed to you - approximate based on equal splits
  // We'd need member count per group for accuracy, so show as overview
  var oweEl = el('dash-you-owe');
  var owedEl = el('dash-owed-to-you');
  if (oweEl) oweEl.textContent = '--';
  if (owedEl) owedEl.textContent = '--';

  updateDashboardGroupCount();
}

function updateDashboardCharts() {
  // Category doughnut chart
  var catCanvas = el('chart-category');
  if (catCanvas && typeof Chart !== 'undefined') {
    var catData = {};
    allExpenses.forEach(function(ex) {
      var cat = ex.category || 'other';
      var usdAmt = convertToUSD(Number(ex.amount), ex.currency);
      catData[cat] = (catData[cat] || 0) + usdAmt;
    });

    var labels = Object.keys(catData);
    var values = labels.map(function(k) { return catData[k]; });
    var colors = ['#8b5cf6', '#06d6a0', '#fbbf24', '#ef4444', '#3b82f6', '#ec4899'];

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(catCanvas, {
      type: 'doughnut',
      data: {
        labels: labels.map(function(l) { return l.charAt(0).toUpperCase() + l.slice(1); }),
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 0,
          hoverOffset: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#c4b5fd', font: { size: 12 }, padding: 16, usePointStyle: true }
          }
        },
        cutout: '65%'
      }
    });
  }

  // Monthly bar chart
  var monthCanvas = el('chart-monthly');
  if (monthCanvas && typeof Chart !== 'undefined') {
    var monthData = {};
    allExpenses.forEach(function(ex) {
      if (!ex.expense_date) return;
      var d = new Date(ex.expense_date);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      var usdAmt = convertToUSD(Number(ex.amount), ex.currency);
      monthData[key] = (monthData[key] || 0) + usdAmt;
    });

    var monthKeys = Object.keys(monthData).sort();
    var last6 = monthKeys.slice(-6);
    var monthLabels = last6.map(function(k) {
      var parts = k.split('-');
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(parts[1]) - 1] + ' ' + parts[0].slice(2);
    });
    var monthValues = last6.map(function(k) { return monthData[k]; });

    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(monthCanvas, {
      type: 'bar',
      data: {
        labels: monthLabels,
        datasets: [{
          label: 'Spending (USD)',
          data: monthValues,
          backgroundColor: 'rgba(139, 92, 246, 0.6)',
          borderColor: '#8b5cf6',
          borderWidth: 1,
          borderRadius: 8,
          hoverBackgroundColor: 'rgba(139, 92, 246, 0.9)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', font: { size: 11 } }
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
              callback: function(v) { return '$' + v; }
            }
          }
        }
      }
    });
  }
}

// ========================================
// CSV EXPORT
// ========================================
var btnExport = el('btn-export-csv');
if (btnExport) {
  btnExport.addEventListener('click', function() {
    if (allExpenses.length === 0) {
      toast('No expenses to export', 'error');
      return;
    }

    var header = 'Date,Description,Amount,Currency,USD Amount,Paid By,Category,Group ID';
    var rows = allExpenses.map(function(ex) {
      var usd = convertToUSD(Number(ex.amount), ex.currency).toFixed(2);
      return [
        ex.expense_date || '',
        '"' + (ex.description || '').replace(/"/g, '""') + '"',
        ex.amount,
        ex.currency || 'USD',
        usd,
        '"' + (ex.paid_by || '').replace(/"/g, '""') + '"',
        ex.category || 'other',
        ex.group_id || ''
      ].join(',');
    });

    var csv = header + '\n' + rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = 'expenses_' + new Date().toISOString().split('T')[0] + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast('CSV exported!', 'success');
  });
}

// ========================================
// REALTIME
// ========================================
function setupRealtime() {
  supabase.channel('expense-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TB_EXPENSES }, function() {
      if (selectedGroupId) loadExpenses();
      loadAllExpensesForDashboard();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: TB_GROUPS }, function() {
      loadGroups();
    })
    .subscribe();
}

// ========================================
// TOAST
// ========================================
function toast(msg, type) {
  type = type || 'info';
  var container = el('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  var t = document.createElement('div');
  t.className = 'toast toast-' + type;

  var icon = 'fa-info-circle';
  if (type === 'success') icon = 'fa-check-circle';
  if (type === 'error') icon = 'fa-exclamation-circle';

  t.innerHTML = '<i class="fas ' + icon + '"></i> ' + msg;
  container.appendChild(t);

  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateX(120%)';
    t.style.transition = 'all 0.3s ease';
    setTimeout(function() { t.remove(); }, 300);
  }, 4000);
}
