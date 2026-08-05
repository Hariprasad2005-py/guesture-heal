// frontend/src/utils/metricsEngine.js

export class MetricsEngine {
  constructor() {
    this.repData = [];
    this.currentRepAngles = [];
    this.repStartTime = null;
    this.repEndTime = null;
    this.isInRep = false;
    this.repThreshold = 15; // degrees change to count as a rep
    this.lastAngle = 0;
    this.repDirection = null; // 'up' or 'down'
  }

  /**
   * Track angle data and detect reps
   * @param {number} angle - Current joint angle in degrees
   * @param {number} timestamp - Current timestamp
   * @returns {object|null} - Rep data if a rep was completed
   */
  trackAngle(angle, timestamp) {
    this.currentRepAngles.push(angle);

    // Initialize
    if (this.lastAngle === 0) {
      this.lastAngle = angle;
      return null;
    }

    const delta = angle - this.lastAngle;
    const absDelta = Math.abs(delta);

    // Detect direction
    if (absDelta > 2) {
      const direction = delta > 0 ? 'up' : 'down';
      
      // Start a rep if direction changes from down to up
      if (this.repDirection === 'down' && direction === 'up' && absDelta > this.repThreshold) {
        // We completed a rep cycle (down then up)
        const repResult = this.completeRep(timestamp);
        this.isInRep = true;
        this.repDirection = direction;
        this.repStartTime = timestamp;
        return repResult;
      }
      
      // Update direction
      if (!this.repDirection || absDelta > this.repThreshold / 2) {
        this.repDirection = direction;
        if (!this.isInRep) {
          this.isInRep = true;
          this.repStartTime = timestamp;
        }
      }
    }

    this.lastAngle = angle;
    return null;
  }

  completeRep(timestamp) {
    const angles = this.currentRepAngles;
    if (angles.length === 0) return null;

    const minAngle = Math.min(...angles);
    const maxAngle = Math.max(...angles);
    const rom = maxAngle - minAngle;
    const avgAngle = angles.reduce((a, b) => a + b, 0) / angles.length;
    const duration = (timestamp - this.repStartTime) / 1000;

    const rep = {
      repNumber: this.repData.length + 1,
      minAngle: Math.round(minAngle),
      maxAngle: Math.round(maxAngle),
      romDegrees: Math.round(rom),
      avgAngle: Math.round(avgAngle),
      durationSeconds: Math.round(duration * 10) / 10,
      angles: [...angles],
      timestamp: timestamp,
    };

    this.repData.push(rep);
    this.currentRepAngles = [];
    this.isInRep = false;
    this.repDirection = null;
    this.repStartTime = null;

    return rep;
  }

  /**
   * Calculate smoothness of movement (jerkiness)
   * @param {number[]} angles - Array of angles
   * @returns {number} - Smoothness score (0-100, higher = smoother)
   */
  calculateSmoothness(angles) {
    if (angles.length < 3) return 100;

    const diffs = [];
    for (let i = 1; i < angles.length; i++) {
      diffs.push(Math.abs(angles[i] - angles[i-1]));
    }

    const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    const maxDiff = Math.max(...diffs);
    
    // Normalize: lower variance = smoother
    const variance = diffs.reduce((a, b) => a + Math.pow(b - avgDiff, 2), 0) / diffs.length;
    const smoothness = Math.max(0, 100 - (variance * 2));
    
    return Math.round(Math.min(100, smoothness));
  }

  /**
   * Get ROM statistics for the session
   */
  getSessionStats() {
    if (this.repData.length === 0) {
      return {
        totalReps: 0,
        averageRom: 0,
        maxRom: 0,
        minRom: 0,
        totalDuration: 0,
        smoothness: 0,
      };
    }

    const roms = this.repData.map(r => r.romDegrees);
    const durations = this.repData.map(r => r.durationSeconds);
    const allAngles = this.repData.flatMap(r => r.angles);

    return {
      totalReps: this.repData.length,
      averageRom: Math.round(roms.reduce((a, b) => a + b, 0) / roms.length),
      maxRom: Math.max(...roms),
      minRom: Math.min(...roms),
      totalDuration: Math.round(durations.reduce((a, b) => a + b, 0) * 10) / 10,
      smoothness: this.calculateSmoothness(allAngles),
      reps: this.repData,
    };
  }

  reset() {
    this.repData = [];
    this.currentRepAngles = [];
    this.repStartTime = null;
    this.isInRep = false;
    this.lastAngle = 0;
    this.repDirection = null;
  }

  /**
   * Calculate accuracy based on target vs actual
   */
  calculateAccuracy(targetAngle, actualAngle, tolerance = 5) {
    const diff = Math.abs(targetAngle - actualAngle);
    if (diff <= tolerance) return 100;
    return Math.max(0, 100 - ((diff - tolerance) / tolerance) * 50);
  }
}

export default MetricsEngine;