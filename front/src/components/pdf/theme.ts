
export const theme = {
    colors: {
        primary: '#1e3a8a', // Blue 900
        secondary: '#ea580c', // Orange 600
        text: '#1f2937', // Gray 800
        textLight: '#6b7280', // Gray 500
        textWhite: '#FFFFFF',
        border: '#e5e7eb', // Gray 200
        bgLight: '#f9fafb', // Gray 50
        bgHeader: '#f3f4f6' // Gray 100
    },
    layout: {
        pageParams: {
            size: 'A4' as const, // 'A4' string literal
            style: {
                paddingTop: 35,
                paddingBottom: 65,
                paddingHorizontal: 35,
            }
        }
    },
    fonts: {
        body: 'Helvetica',
        bold: 'Helvetica-Bold',
        oblique: 'Helvetica-Oblique'
    }
};
