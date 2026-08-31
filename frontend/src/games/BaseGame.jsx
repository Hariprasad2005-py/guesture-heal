// frontend/src/games/BaseGame.jsx
import React, { useEffect, useRef, useState } from "react";
import { useUnifiedMediaPipe } from "../hooks/useUnifiedMediaPipe";
import AdaptiveDifficultyEngine from "../engine/AdaptiveDifficultyEngine";

export default function BaseGame({
    gameId,
    patientId,
    onSessionEnd,
    updateLoop,
    drawLoop,
    initialConfig = {}
}) {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const engineRef = useRef(null);
    const animationFrameRef = useRef(null);

    const [sessionActive, setSessionActive] = useState(false);
    const [metricsDisplay, setMetricsDisplay] = useState({});

    const { isLoaded, error, resultsRef } = useUnifiedMediaPipe({
        videoRef,
        enabled: true
    });

    // Init Engine
    useEffect(() => {
        engineRef.current = new AdaptiveDifficultyEngine(initialConfig);
    }, []);

    // Main Loop
    useEffect(() => {
        if (!sessionActive || !isLoaded) return;

        let lastTime = performance.now();

        const loop = (time) => {
            const deltaTime = time - lastTime;
            lastTime = time;

            const results = resultsRef.current;
            const adaptiveConfig = engineRef.current.getConfig();

            const ctx = canvasRef.current?.getContext("2d");

            if (ctx && updateLoop && drawLoop) {
                // Clear canvas
                ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

                // Pass to game-specific update logic
                const latestMetrics = updateLoop(deltaTime, results, adaptiveConfig, engineRef.current);

                // Update local HUD state periodically rather than every frame
                if (time % 500 < 16 && latestMetrics) {
                    setMetricsDisplay(latestMetrics);
                }

                // Draw phase
                drawLoop(ctx, results, adaptiveConfig);
            }

            animationFrameRef.current = requestAnimationFrame(loop);
        };

        animationFrameRef.current = requestAnimationFrame(loop);

        return () => {
            cancelAnimationFrame(animationFrameRef.current);
        };
    }, [sessionActive, isLoaded, updateLoop, drawLoop]);

    if (error) return <div className="text-red-500 p-8">Camera/Model Error: {error.message}</div>;

    return (
        <div className="relative w-full h-screen bg-gray-900 border-4 border-gray-800 rounded-xl overflow-hidden flex flex-col">
            {/* Clinician & Patient HUD */}
            <div className="absolute top-0 left-0 right-0 p-6 flex justify-between z-10 bg-gradient-to-b from-black/80 to-transparent pointer-events-none text-white">
                <div>
                    <h2 className="text-3xl font-bold">{gameId.toUpperCase()}</h2>
                    <div className="mt-2 text-xl">
                        {Object.entries(metricsDisplay).map(([k, v]) => (
                            <span key={k} className="mr-4 bg-black/50 px-3 py-1 rounded">{k}: {v}</span>
                        ))}
                    </div>
                </div>
                <div className="text-right">
                    {!isLoaded ? (
                        <div className="text-yellow-400 font-bold animate-pulse text-2xl">Loading AI...</div>
                    ) : !sessionActive ? (
                        <button
                            onClick={() => setSessionActive(true)}
                            className="bg-green-500 hover:bg-green-400 text-black font-bold py-3 px-8 rounded-full text-2xl pointer-events-auto"
                        >
                            START SESSION
                        </button>
                    ) : (
                        <button
                            onClick={() => {
                                setSessionActive(false);
                                onSessionEnd(engineRef.current.getFinalMetrics());
                            }}
                            className="bg-red-500 hover:bg-red-400 text-white font-bold py-3 px-8 rounded-full text-2xl pointer-events-auto shadow-lg"
                        >
                            END SESSION
                        </button>
                    )}
                </div>
            </div>

            <div className="relative flex-grow pointer-events-none">
                <video
                    ref={videoRef}
                    className="absolute inset-0 w-full h-full object-cover opacity-30 transform -scale-x-100"
                    autoPlay
                    playsInline
                    muted
                />
                <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full"
                    width={1280}
                    height={720}
                />
            </div>
        </div>
    );
}
