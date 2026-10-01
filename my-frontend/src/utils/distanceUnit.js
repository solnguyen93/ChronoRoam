// Miles for °F, kilometers for °C (Account has one combined "°F / mi" | "°C / km" setting).
export function getDistanceUnitFromTempUnit(tempUnit) {
    return tempUnit === 'C' ? 'km' : 'mi';
}
