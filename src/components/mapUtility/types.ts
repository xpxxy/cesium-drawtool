import * as Cesium from 'cesium';

export type Wgs84Coordinate =  [number, number, number?];

export type ZoneType = 'workZone' | 'limitZone' | 'forbidZone';

export interface Circle {
    id: string;
    center: Wgs84Coordinate;
    radius: number;
}