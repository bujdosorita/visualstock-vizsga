const { calculateNewStock } = require('./logic');

describe('Raktárkészlet kalkulációs tesztek', () => {
    
    test('TC-03 Kódolt teszt: A készlet nem mehet nulla alá (Határérték-elemzés)', () => {
        const eredmeny = calculateNewStock(5, -10);
        expect(eredmeny).toBe(0); 
    });

    test('Logikai teszt: Helyes készletcsökkentés', () => {
        const eredmeny = calculateNewStock(10, -2);
        expect(eredmeny).toBe(8);
    });
    
    test('Logikai teszt: Készlet növelése', () => {
        const eredmeny = calculateNewStock(50, 15);
        expect(eredmeny).toBe(65);
    });
});