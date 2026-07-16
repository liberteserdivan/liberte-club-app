// Müşteri hesabı silme — Apple / Google hesap silme gereksinimi

const CUSTOMER_ARRAY_KEYS = [
  'history',
  'pushSubscriptions',
  'dailyClaims',
  'wheelSpins',
  'firstOrderBonuses',
  'checkIns',
  'couponUses',
  'feedback'
];

// customerId içeren dizileri temizle
function withoutCustomerRows(list, customerId) {
  return (list || []).filter((row) => row.customerId !== customerId);
}

// Yerel cihaz kayıtlarını temizle
export function clearLocalCustomerSession(customerId) {
  if (customerId) {
    localStorage.removeItem(`libertePushDismissed:${customerId}`);
    localStorage.removeItem(`libertePushDevice:${customerId}`);
    localStorage.removeItem(`liberteOnboarded:${customerId}`);
  }
  try {
    localStorage.removeItem('liberteDB');
  } catch {
    // Depolama kapalıysa sessizce geç
  }
}

// Kullanıcı kendi hesabını siler
export function deleteCustomerAccount(db, customerId, source = 'Kullanıcı hesap silme') {
  const customer = (db.customers || []).find((c) => c.id === customerId);
  if (!customer) return db;

  if (customer.isAdmin) {
    const adminCount = (db.customers || []).filter((c) => c.isAdmin).length;
    if (adminCount <= 1) {
      throw new Error('Son yönetici hesabı uygulama içinden silinemez.');
    }
  }

  const loyalty = { ...(db.loyalty || {}) };
  delete loyalty[customerId];

  const notes = { ...(db.customerNotes || {}) };
  delete notes[customerId];

  const next = {
    ...db,
    customers: (db.customers || []).filter((c) => c.id !== customerId),
    loyalty,
    customerNotes: notes,
    referrals: (db.referrals || []).filter(
      (row) => row.customerId !== customerId && row.referrerId !== customerId
    )
  };

  CUSTOMER_ARRAY_KEYS.forEach((key) => {
    next[key] = withoutCustomerRows(db[key], customerId);
  });

  const createdAt = new Date().toLocaleString('tr-TR');
  next.history = [
    {
      id: Date.now(),
      customerId,
      name: customer.name,
      phone: customer.phone,
      type: 'customer_delete',
      count: 0,
      source,
      createdAt
    },
    ...withoutCustomerRows(db.history, customerId)
  ];

  return next;
}
