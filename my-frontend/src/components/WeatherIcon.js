import React from 'react';
import { ReactComponent as Sun } from '../assets/icons/sun.svg';
import { ReactComponent as CloudSun } from '../assets/icons/cloud-sun.svg';
import { ReactComponent as Cloudy } from '../assets/icons/cloudy.svg';
import { ReactComponent as CloudFog } from '../assets/icons/cloud-fog.svg';
import { ReactComponent as CloudDrizzle } from '../assets/icons/cloud-drizzle.svg';
import { ReactComponent as CloudRainWind } from '../assets/icons/cloud-rain-wind.svg';
import { ReactComponent as CloudSunRain } from '../assets/icons/cloud-sun-rain.svg';
import { ReactComponent as CloudLightning } from '../assets/icons/cloud-lightning.svg';
import { ReactComponent as CloudHail } from '../assets/icons/cloud-hail.svg';
import { ReactComponent as Snowflake } from '../assets/icons/snowflake.svg';
import { ReactComponent as Wind } from '../assets/icons/wind.svg';

// Weather icons (Lucide SVGs imported as components, so they take the surrounding text color).
// Heavy snow uses the snow icon (see wmoIconKind in useWeather.js).
const ICONS = {
    sun: Sun,
    'partly-cloudy': CloudSun,
    cloudy: Cloudy,
    fog: CloudFog,
    rain: CloudDrizzle,
    'heavy-rain': CloudRainWind,
    'sun-rain': CloudSunRain,
    storm: CloudLightning,
    hail: CloudHail,
    snow: Snowflake,
    windy: Wind,
};

// If an icon fails to draw, show nothing instead of breaking the whole day card.
class IconErrorBoundary extends React.Component {
    state = { hasError: false };
    static getDerivedStateFromError() {
        return { hasError: true };
    }
    render() {
        return this.state.hasError ? null : this.props.children;
    }
}

// The weather icon for a kind like 'sun' or 'rain', or nothing for an unknown kind.
function WeatherIcon({ kind }) {
    const Icon = ICONS[kind];
    if (!Icon) return null;
    return (
        <IconErrorBoundary>
            <Icon className="weather-icon" width="20" height="20" />
        </IconErrorBoundary>
    );
}

export default WeatherIcon;
