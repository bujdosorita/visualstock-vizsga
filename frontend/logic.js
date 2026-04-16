function calculateNewStock(current, change) {
    const newStock = current + change;
    return newStock < 0 ? 0 : newStock; // Ha nulla alá menne, akkor 0-t ad vissza
}
module.exports = { calculateNewStock };