const { calculateNewStock } = require('./logic');

describe('Raktárkészlet kalkulációs tesztek', () => {
    
    test('UNIT-01 Kódolt teszt: A készlet nem mehet nulla alá', () => {
        const eredmeny = calculateNewStock(5, -10);
        expect(eredmeny).toBe(0); 
    });

    test('UNIT-02 Kódolt teszt: Helyes készletcsökkentés', () => {
        const eredmeny = calculateNewStock(10, -2);
        expect(eredmeny).toBe(8);
    });
    
    test('UNIT-03 Kódolt teszt: Készlet növelése', () => {
        const eredmeny = calculateNewStock(50, 15);
        expect(eredmeny).toBe(65);
    });
});