const { calculateNewStock } = require('./logic');

describe('Raktárkészlet kalkulációs tesztek', () => {
    
    test('TC-03 Kódolt teszt: A készlet nem mehet nulla alá', () => {
        const eredmeny = calculateNewStock(5, -10);
        expect(eredmeny).toBe(0); 
    });

    test('TC-04 Kódolt teszt: Helyes készletcsökkentés', () => {
        const eredmeny = calculateNewStock(10, -2);
        expect(eredmeny).toBe(8);
    });
    
    test('TC-05 Kódolt teszt: Készlet növelése', () => {
        const eredmeny = calculateNewStock(50, 15);
        expect(eredmeny).toBe(65);
    });
});