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
let exchangeRates = null;
let ratesFetchedAt = 0;
let currentCategoryFilter = 'all';
let selectedReceiptFile = null;

// ========================================
// SAFE DOM HELPER
// ========================================
function el(id) {
  const e = document.getElementById(id);
  if (!e) console.warn('Missing element: ' + id);
  return e;
}

// ========================================
// INIT
// ========================================
try {
  setTimeout(function() {
    var ls = el('loading-screen');
    if (ls) ls.classList.add('hidden');
    initAuth();
  }, 1600);
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

    if (btn.getAttribute('data-t') === 'settle' && selectedGroupId) {
      calculateSettlement();
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
// GROUPS
// ========================================
async function loadGroups() {
  try {
    var res = await supabase.from(TB_GROUPS).select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    groups = res.data || [];
    renderGroups();
    renderGroupSelector();
  } catch(e) {
    console.error('Load groups error:', e.message);
  }
}

function renderGroups() {
  var container = el('groups-list');
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><h3>No groups yet</h3><p>Create your first group to start splitting expenses</p></div>';
    return;
  }

  container.innerHTML = groups.map(function(g) {
    var isSelected = g.id === selectedGroupId;
    return '<div class="group-card ' + (isSelected ? 'selected' : '') + '" onclick="window._selectGroup(\'' + g.id + '\')">' +
      '<div class="group-icon"><i class="fas fa-users"></i></div>' +
      '<div class="group-info">' +
        '<div class="group-name">' + esc(g.name) + '</div>' +
        '<div class="group-date">' + formatDate(g.created_at) + '</div>' +
      '</div>' +
      (isSelected ? '<i class="fas fa-check-circle group-check"></i>' : '') +
    '</div>';
  }).join('');
}

function renderGroupSelector() {
  var sel = el('expense-group');
  var sel2 = el('settle-group');
  if (!sel) return;

  var opts = '<option value="">-- Select Group --</option>';
  groups.forEach(function(g) {
    var selected = g.id === selectedGroupId ? ' selected' : '';
    opts += '<option value="' + g.id + '"' + selected + '>' + esc(g.name) + '</option>';
  });
  sel.innerHTML = opts;
  if (sel2) sel2.innerHTML = opts;
}

window._selectGroup = async function(gid) {
  selectedGroupId = gid;
  renderGroups();
  renderGroupSelector();
  await loadMembers(gid);
  await loadExpenses();
  calculateSettlement();
};

// ========================================
// CREATE GROUP
// ========================================
var memberCount = 2;

var btnAddMember = el('btn-add-member');
if (btnAddMember) {
  btnAddMember.addEventListener('click', function() {
    memberCount++;
    var container = el('members-inputs');
    if (!container) return;
    var div = document.createElement('div');
    div.className = 'field member-field';
    div.innerHTML = '<i class="fas fa-user"></i><input type="text" placeholder="Member ' + memberCount + ' name" class="member-name-input" required>';
    container.appendChild(div);
  });
}

var createGroupForm = el('create-group-form');
if (createGroupForm) {
  createGroupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var nameInput = el('group-name');
    if (!nameInput) return;
    var groupName = nameInput.value.trim();
    if (!groupName) { toast('Enter a group name', 'error'); return; }

    var memberInputs = document.querySelectorAll('.member-name-input');
    var memberNames = [];
    memberInputs.forEach(function(inp) {
      var v = inp.value.trim();
      if (v) memberNames.push(v);
    });
    if (memberNames.length < 2) {
      toast('Add at least 2 members', 'error');
      return;
    }

    var btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; }

    try {
      var gRes = await supabase.from(TB_GROUPS).insert({
        name: groupName,
        created_by: displayName
      }).select().single();
      if (gRes.error) throw gRes.error;

      var gid = gRes.data.id;
      var memberRows = memberNames.map(function(n) {
        return { group_id: gid, name: n };
      });
      var mRes = await supabase.from(TB_MEMBERS).insert(memberRows);
      if (mRes.error) throw mRes.error;

      toast('Group created!', 'success');
      nameInput.value = '';
      resetMemberInputs();
      memberCount = 2;
      await loadGroups();
      window._selectGroup(gid);
    } catch(err) {
      toast('Failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Create Group'; }
    }
  });
}

function resetMemberInputs() {
  var container = el('members-inputs');
  if (!container) return;
  container.innerHTML =
    '<div class="field member-field"><i class="fas fa-user"></i><input type="text" placeholder="Member 1 name" class="member-name-input" required></div>' +
    '<div class="field member-field"><i class="fas fa-user"></i><input type="text" placeholder="Member 2 name" class="member-name-input" required></div>';
}

// ========================================
// MEMBERS
// ========================================
async function loadMembers(gid) {
  try {
    var res = await supabase.from(TB_MEMBERS).select('*').eq('group_id', gid).order('created_at', { ascending: true });
    if (res.error) throw res.error;
    selectedGroupMembers = res.data || [];
    renderPaidBySelect();
  } catch(e) {
    console.error('Load members error:', e.message);
    selectedGroupMembers = [];
  }
}

function renderPaidBySelect() {
  var sel = el('expense-paid-by');
  if (!sel) return;
  var opts = '<option value="">Who paid?</option>';
  selectedGroupMembers.forEach(function(m) {
    opts += '<option value="' + esc(m.name) + '">' + esc(m.name) + '</option>';
  });
  sel.innerHTML = opts;
}

// ========================================
// EXPENSES
// ========================================
async function loadExpenses() {
  if (!selectedGroupId) { expenses = []; renderExpenses(); return; }
  try {
    var res = await supabase.from(TB_EXPENSES).select('*').eq('group_id', selectedGroupId).order('date', { ascending: false });
    if (res.error) throw res.error;
    expenses = res.data || [];
    renderExpenses();
  } catch(e) {
    console.error('Load expenses error:', e.message);
  }
}

function renderExpenses() {
  var container = el('expenses-list');
  if (!container) return;

  var filtered = expenses;
  if (currentCategoryFilter !== 'all') {
    filtered = expenses.filter(function(ex) { return ex.category === currentCategoryFilter; });
  }

  if (!selectedGroupId) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><h3>Select a group first</h3><p>Choose a group from the Groups tab</p></div>';
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><h3>No expenses yet</h3><p>Add your first expense below</p></div>';
    return;
  }

  container.innerHTML = filtered.map(function(ex) {
    var catIcon = getCategoryIcon(ex.category);
    var currLabel = '';
    if (ex.original_currency && ex.original_currency !== 'USD') {
      currLabel = '<span class="exp-converted">' + ex.original_currency + ' ' + Number(ex.original_amount).toFixed(2) + '</span>';
    }
    var receiptThumb = '';
    if (ex.receipt_url) {
      receiptThumb = '<div class="exp-receipt-thumb" onclick="event.stopPropagation(); window._viewReceipt(\'' + esc(ex.receipt_url) + '\')"><i class="fas fa-camera"></i></div>';
    }
    return '<div class="expense-card">' +
      '<div class="exp-cat-icon"><i class="fas fa-' + catIcon + '"></i></div>' +
      '<div class="exp-details">' +
        '<div class="exp-desc">' + esc(ex.description) + '</div>' +
        '<div class="exp-meta">' + esc(ex.paid_by) + ' - ' + formatDate(ex.date) + '</div>' +
        currLabel +
      '</div>' +
      '<div class="exp-right">' +
        '<div class="exp-amount">$' + Number(ex.amount).toFixed(2) + '</div>' +
        '<div class="exp-cat-label">' + esc(ex.category || 'other') + '</div>' +
        receiptThumb +
      '</div>' +
    '</div>';
  }).join('');
}

function getCategoryIcon(cat) {
  var icons = {
    food: 'utensils',
    transport: 'car',
    rent: 'home',
    utilities: 'bolt',
    entertainment: 'film',
    other: 'ellipsis-h'
  };
  return icons[cat] || 'ellipsis-h';
}

// ========================================
// CATEGORY FILTER
// ========================================
document.querySelectorAll('.cat-filter-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.cat-filter-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentCategoryFilter = btn.getAttribute('data-cat');
    renderExpenses();
  });
});

// ========================================
// GROUP SELECTOR (on expense tab)
// ========================================
var expGroupSel = el('expense-group');
if (expGroupSel) {
  expGroupSel.addEventListener('change', async function() {
    var gid = this.value;
    if (gid) {
      selectedGroupId = gid;
      renderGroups();
      await loadMembers(gid);
      await loadExpenses();
    }
  });
}

var settleGroupSel = el('settle-group');
if (settleGroupSel) {
  settleGroupSel.addEventListener('change', async function() {
    var gid = this.value;
    if (gid) {
      selectedGroupId = gid;
      renderGroups();
      renderGroupSelector();
      await loadMembers(gid);
      await loadExpenses();
      calculateSettlement();
    }
  });
}

// ========================================
// CREATE EXPENSE
// ========================================
var receiptUploadArea = el('receipt-upload');
if (receiptUploadArea) {
  receiptUploadArea.addEventListener('click', function() {
    var inp = el('receipt-input');
    if (inp) inp.click();
  });
}

var receiptInput = el('receipt-input');
if (receiptInput) {
  receiptInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) {
      selectedReceiptFile = file;
      var preview = el('receipt-preview');
      var placeholder = el('receipt-placeholder');
      if (preview && placeholder) {
        var reader = new FileReader();
        reader.onload = function(ev) {
          preview.src = ev.target.result;
          preview.classList.remove('hidden');
          placeholder.classList.add('hidden');
        };
        reader.readAsDataURL(file);
      }
    }
  });
}

var expenseForm = el('expense-form');
if (expenseForm) {
  expenseForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    if (!selectedGroupId) { toast('Select a group first', 'error'); return; }

    var desc = el('exp-desc').value.trim();
    var amountVal = parseFloat(el('exp-amount').value);
    var paidBy = el('expense-paid-by').value;
    var currency = el('exp-currency').value;
    var category = el('exp-category').value;
    var dateVal = el('exp-date').value;

    if (!desc || !amountVal || !paidBy || !category) {
      toast('Fill in all required fields', 'error');
      return;
    }
    if (!dateVal) dateVal = new Date().toISOString().split('T')[0];

    var btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...'; }

    try {
      await fetchExchangeRates();

      var usdAmount = amountVal;
      var origAmount = amountVal;
      var origCurrency = currency;

      if (currency !== 'USD') {
        usdAmount = convertToUSD(amountVal, currency);
      }

      var receiptUrl = null;
      var receiptPath = null;

      if (selectedReceiptFile) {
        var ext = selectedReceiptFile.name.split('.').pop();
        var path = currentUser.id + '/' + Date.now() + '.' + ext;
        var upRes = await supabase.storage.from(BUCKET).upload(path, selectedReceiptFile);
        if (upRes.error) throw upRes.error;
        var urlRes = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
        receiptUrl = urlRes.data ? urlRes.data.signedUrl : null;
        receiptPath = path;
      }

      var insertData = {
        group_id: selectedGroupId,
        paid_by: paidBy,
        description: desc,
        amount: Math.round(usdAmount * 100) / 100,
        original_amount: origAmount,
        original_currency: origCurrency,
        date: dateVal,
        category: category,
        receipt_url: receiptUrl,
        receipt_path: receiptPath
      };

      var res = await supabase.from(TB_EXPENSES).insert(insertData);
      if (res.error) throw res.error;

      toast('Expense added!', 'success');
      e.target.reset();
      selectedReceiptFile = null;
      var preview = el('receipt-preview');
      var placeholder = el('receipt-placeholder');
      if (preview) preview.classList.add('hidden');
      if (placeholder) placeholder.classList.remove('hidden');

      // Set default date to today
      var dateInput = el('exp-date');
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

      await loadExpenses();
      calculateSettlement();
    } catch(err) {
      toast('Failed: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-plus"></i> Add Expense'; }
    }
  });
}

// Set default date
var dateInput = el('exp-date');
if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

// ========================================
// VIEW RECEIPT MODAL
// ========================================
window._viewReceipt = function(url) {
  var modal = el('receipt-modal');
  var img = el('receipt-modal-img');
  if (modal && img) {
    img.src = url;
    modal.classList.remove('hidden');
  }
};

var closeReceiptModal = el('close-receipt-modal');
if (closeReceiptModal) {
  closeReceiptModal.addEventListener('click', function() {
    var modal = el('receipt-modal');
    if (modal) modal.classList.add('hidden');
  });
}

var receiptOverlay = document.querySelector('#receipt-modal .modal-overlay');
if (receiptOverlay) {
  receiptOverlay.addEventListener('click', function() {
    var modal = el('receipt-modal');
    if (modal) modal.classList.add('hidden');
  });
}

// ========================================
// SETTLEMENT CALCULATION
// ========================================
function calculateSettlement() {
  var balancesContainer = el('balances-list');
  var paymentsContainer = el('payments-list');
  if (!balancesContainer || !paymentsContainer) return;

  if (!selectedGroupId || selectedGroupMembers.length === 0) {
    balancesContainer.innerHTML = '<div class="empty-state"><i class="fas fa-balance-scale"></i><h3>Select a group</h3><p>Choose a group to see balances</p></div>';
    paymentsContainer.innerHTML = '';
    return;
  }

  // Calculate totals per member
  var memberNames = selectedGroupMembers.map(function(m) { return m.name; });
  var paid = {};
  var totalExpense = 0;

  memberNames.forEach(function(n) { paid[n] = 0; });

  expenses.forEach(function(ex) {
    var amt = Number(ex.amount) || 0;
    totalExpense += amt;
    if (paid[ex.paid_by] !== undefined) {
      paid[ex.paid_by] += amt;
    }
  });

  var perPerson = memberNames.length > 0 ? totalExpense / memberNames.length : 0;

  // Calculate net balance (positive = owed money, negative = owes money)
  var balances = {};
  memberNames.forEach(function(n) {
    balances[n] = paid[n] - perPerson;
  });

  // Render balances
  balancesContainer.innerHTML =
    '<div class="settle-total"><span>Total expenses</span><strong>$' + totalExpense.toFixed(2) + '</strong></div>' +
    '<div class="settle-total"><span>Per person</span><strong>$' + perPerson.toFixed(2) + '</strong></div>' +
    '<div class="settle-divider"></div>' +
    memberNames.map(function(n) {
      var bal = balances[n];
      var cls = bal >= 0 ? 'positive' : 'negative';
      var sign = bal >= 0 ? '+' : '';
      return '<div class="balance-row">' +
        '<span class="balance-name">' + esc(n) + '</span>' +
        '<span class="balance-paid">Paid $' + paid[n].toFixed(2) + '</span>' +
        '<span class="balance-amount ' + cls + '">' + sign + '$' + Math.abs(bal).toFixed(2) + '</span>' +
      '</div>';
    }).join('');

  // Calculate suggested payments (simplified debt)
  var debtors = [];
  var creditors = [];
  memberNames.forEach(function(n) {
    if (balances[n] < -0.01) {
      debtors.push({ name: n, amount: -balances[n] });
    } else if (balances[n] > 0.01) {
      creditors.push({ name: n, amount: balances[n] });
    }
  });

  // Sort descending
  debtors.sort(function(a, b) { return b.amount - a.amount; });
  creditors.sort(function(a, b) { return b.amount - a.amount; });

  var payments = [];
  var di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    var payAmt = Math.min(debtors[di].amount, creditors[ci].amount);
    if (payAmt > 0.01) {
      payments.push({
        from: debtors[di].name,
        to: creditors[ci].name,
        amount: payAmt
      });
    }
    debtors[di].amount -= payAmt;
    creditors[ci].amount -= payAmt;
    if (debtors[di].amount < 0.01) di++;
    if (creditors[ci].amount < 0.01) ci++;
  }

  if (payments.length === 0) {
    paymentsContainer.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><h3>All settled up!</h3><p>No payments needed</p></div>';
  } else {
    paymentsContainer.innerHTML = '<h3 class="payments-title"><i class="fas fa-exchange-alt"></i> Suggested Payments</h3>' +
      payments.map(function(p) {
        return '<div class="payment-card">' +
          '<div class="payment-from"><i class="fas fa-user"></i> ' + esc(p.from) + '</div>' +
          '<div class="payment-arrow"><i class="fas fa-arrow-right"></i></div>' +
          '<div class="payment-to"><i class="fas fa-user"></i> ' + esc(p.to) + '</div>' +
          '<div class="payment-amount">$' + p.amount.toFixed(2) + '</div>' +
        '</div>';
      }).join('');
  }
}

// ========================================
// REALTIME
// ========================================
function setupRealtime() {
  supabase.channel('expense-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: TB_EXPENSES }, function() {
      if (selectedGroupId) loadExpenses();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: TB_GROUPS }, function() {
      loadGroups();
    })
    .subscribe();
}

// ========================================
// UTILS
// ========================================
function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function formatDate(d) {
  if (!d) return '';
  try {
    var dt = new Date(d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch(e) {
    return String(d);
  }
}

function showError(elId, msg) {
  var box = el(elId);
  if (box) {
    box.textContent = msg;
    box.classList.remove('hidden');
  }
}

// Toast system
var toastContainer = null;
function toast(msg, type) {
  if (!toastContainer) {
    toastContainer = el('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }
  var t = document.createElement('div');
  t.className = 'toast toast-' + (type || 'info');
  t.textContent = msg;
  toastContainer.appendChild(t);
  setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    t.style.transition = 'all 0.3s';
    setTimeout(function() { t.remove(); }, 300);
  }, 3500);
}
