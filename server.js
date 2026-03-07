// دالة حساب المجموع (عدلها لهيك)
function calculateOrderTotal(items, zonePrice = 0, type = "delivery") {
  let subtotal = 0;
  const itemsList = [];
  
  for (const item of items) {
    // إذا كان item عبارة عن نص، نحاول نستخرج الكمية والاسم
    if (typeof item === 'string') {
      const match = item.match(/(\d+)?\s*(.+)/);
      const quantity = match && match[1] ? parseInt(match[1]) : 1;
      const itemName = match ? match[2].trim() : item;
      
      const menuItem = MENU_ITEMS[itemName];
      if (menuItem) {
        const itemTotal = menuItem.price * quantity;
        subtotal += itemTotal;
        itemsList.push(`${quantity} × ${menuItem.name} = ${itemTotal.toFixed(2)} د.أ`);
      }
    } 
    // إذا كان object
    else if (item.name) {
      const menuItem = MENU_ITEMS[item.name];
      if (menuItem) {
        const itemTotal = menuItem.price * (item.quantity || 1);
        subtotal += itemTotal;
        itemsList.push(`${item.quantity || 1} × ${menuItem.name} = ${itemTotal.toFixed(2)} د.أ`);
      }
    }
  }
  
  const deliveryFee = type === "delivery" ? (parseFloat(zonePrice) || 0) : 0;
  const total = subtotal + deliveryFee;
  
  return {
    items: itemsList,
    subtotal: subtotal.toFixed(2),
    delivery: deliveryFee.toFixed(2),
    total: total.toFixed(2),
    foodTotal: subtotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    grandTotal: total.toFixed(2)
  };
}
