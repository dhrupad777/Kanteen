"use client";

import React, { useRef, useEffect, useState, Suspense, useLayoutEffect, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Float, Environment } from "@react-three/drei";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRouter } from "next/navigation";
import Image from "next/image";

// Register GSAP plugins once
if (typeof window !== "undefined") {
    gsap.registerPlugin(ScrollTrigger);
}

// ============ OPTIMIZED CONFIGURATION ============
const CONFIG = {
    desktop: {
        camera: { y: 0.5, z: 6, fov: 42 },
        scale: 0.85,  // Larger scale for prominence
        position: { x: 0, y: -1.2, z: 0 }
    },
    mobile: {
        camera: { y: 0.5, z: 6, fov: 42 },
        scale: 1.0,  // Larger scale for mobile prominence
        position: { x: 0, y: -1.5, z: 0 }
    },
    animation: {
        rotationSpeed: 0.2,
        scrollRotation: 2.0,
        breatheIntensity: 0.01,
        floatSpeed: 1.5,
        floatIntensity: 0.08,
        rotationIntensity: 0.03
    },
    scroll: {
        zMultiplier: 1.5,
        yMultiplier: 0.2
    }
};

// ============ 3D MODEL COMPONENT ============
interface ModelProps {
    scrollY: React.MutableRefObject<number>;
}

function Model({ scrollY }: ModelProps) {
    const { scene: originalScene } = useGLTF("/model.glb");
    const groupRef = useRef<THREE.Group>(null);
    const { viewport } = useThree();

    // Clone the scene to avoid scale accumulation from cached GLTF
    const scene = useMemo(() => originalScene.clone(), [originalScene]);

    // Detect mobile viewport
    const isMobile = viewport.width < 5;
    const config = isMobile ? CONFIG.mobile : CONFIG.desktop;

    // Scale model based on viewport - responsive scaling
    // Changed to useLayoutEffect to prevent visible resizing jump
    useLayoutEffect(() => {
        if (scene) {
            // Reset scale to 1 before calculating to avoid compounding
            scene.scale.setScalar(1);
            const box = new THREE.Box3().setFromObject(scene);
            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            // Use viewport dimensions for responsive scaling
            const viewportScale = Math.min(viewport.width, viewport.height) * config.scale;
            const scale = viewportScale / maxDim;
            scene.scale.setScalar(scale);
        }
    }, [scene, viewport.width, viewport.height, config.scale]);

    // Animation loop
    useFrame((state) => {
        if (!groupRef.current) return;

        const time = state.clock.elapsedTime;
        const scrollProgress = scrollY.current;
        const { animation, scroll } = CONFIG;

        // Rotation
        groupRef.current.rotation.y = time * animation.rotationSpeed + scrollProgress * animation.scrollRotation;
        groupRef.current.rotation.x = Math.sin(time * 0.3) * 0.08;

        // Breathing effect
        const breathe = 1 + Math.sin(time * 1.5) * animation.breatheIntensity;
        groupRef.current.scale.setScalar(breathe);

        // Scroll-based movement
        groupRef.current.position.z = config.position.z + scrollProgress * scroll.zMultiplier;
        groupRef.current.position.y = config.position.y + Math.sin(scrollProgress * Math.PI) * scroll.yMultiplier;
        groupRef.current.position.x = config.position.x;
    });

    return (
        <Float
            speed={CONFIG.animation.floatSpeed}
            rotationIntensity={CONFIG.animation.rotationIntensity}
            floatIntensity={CONFIG.animation.floatIntensity}
        >
            <group ref={groupRef} position={[config.position.x, config.position.y, config.position.z]}>
                <primitive object={scene} />
            </group>
        </Float>
    );
}

// ============ SCENE SETUP ============
function Scene({ scrollY }: ModelProps) {
    const { camera, viewport } = useThree();
    const isMobile = viewport.width < 5;
    const camConfig = isMobile ? CONFIG.mobile.camera : CONFIG.desktop.camera;

    useLayoutEffect(() => {
        camera.position.y = camConfig.y;
        camera.position.z = camConfig.z;
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = camConfig.fov;
            camera.updateProjectionMatrix();
        }
    }, [camConfig.y, camConfig.z, camConfig.fov, camera]);

    return (
        <>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={1.2} color="#FFF8DC" />
            <directionalLight position={[-5, -5, 5]} intensity={0.5} color="#FFD700" />
            <pointLight position={[0, 0, 5]} intensity={1} color="#FFD700" distance={15} />
            <Environment preset="city" />
            <Model scrollY={scrollY} />
        </>
    );
}

// ============ LOADING STATE ============
function Loader() {
    return (
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        </div>
    );
}

// ============ CSS FALLBACK ============
function CSSFallback() {
    return (
        <div className="absolute inset-0 flex items-center justify-center" style={{ perspective: "1000px" }}>
            <div className="relative animate-pulse mt-16 w-48 h-48 md:w-[400px] md:h-[400px]" style={{ transformStyle: "preserve-3d" }}>
                <div className="absolute inset-0 scale-125 blur-3xl opacity-50">
                    <Image
                        src="/lawschool.png"
                        alt=""
                        fill
                        className="object-contain"
                        priority
                    />
                </div>
                <Image
                    src="/lawschool.png"
                    alt="Amity Law School Emblem"
                    fill
                    className="object-contain drop-shadow-[0_0_60px_rgba(245,158,11,0.6)]"
                    priority
                />
            </div>
        </div>
    );
}

// ============ CHECK WEBGL ============
function checkWebGL(): boolean {
    if (typeof window === "undefined") return false;
    try {
        const canvas = document.createElement("canvas");
        return !!(window.WebGLRenderingContext && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    } catch {
        return false;
    }
}

// ============ MAIN HERO COMPONENT ============
export function Hero3D() {
    const router = useRouter();
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollY = useRef(0);

    const [mounted, setMounted] = useState(false);
    const [webGL, setWebGL] = useState(true);

    // Refs for GSAP animations
    const backTextRef = useRef<HTMLDivElement>(null);
    const frontTextRef = useRef<HTMLDivElement>(null);
    const badgeRef = useRef<HTMLDivElement>(null);
    const buttonsRef = useRef<HTMLDivElement>(null);
    const scrollIndicatorRef = useRef<HTMLDivElement>(null);

    // Mount check
    useEffect(() => {
        setMounted(true);
        setWebGL(checkWebGL());
    }, []);

    // ============ GSAP SCROLL ANIMATION ============
    useEffect(() => {
        if (!mounted || !containerRef.current) return;

        const ctx = gsap.context(() => {
            ScrollTrigger.create({
                trigger: containerRef.current,
                start: "top top",
                end: "bottom top",
                scrub: 0.5,
                onUpdate: (self) => {
                    scrollY.current = self.progress;
                },
            });

            // Buttons visible on load - removed scroll trigger
            gsap.fromTo(
                buttonsRef.current,
                { opacity: 0, y: 30 },
                {
                    opacity: 1,
                    y: 0,
                    duration: 1,
                    delay: 0.8,
                    ease: "power2.out",
                }
            );

            gsap.to(scrollIndicatorRef.current, {
                opacity: 0,
                y: -20,
                scrollTrigger: {
                    trigger: containerRef.current,
                    start: "top -5%",
                    end: "top -15%",
                    scrub: 1,
                },
            });

            // Removed backTextRef scroll animation that was dimming the text
            // We want VIDHI to stay bright and consistent
        }, containerRef);

        return () => ctx.revert();
    }, [mounted]);

    // ============ ENTRY ANIMATIONS ============
    useEffect(() => {
        if (!mounted) return;

        const ctx = gsap.context(() => {
            const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

            gsap.set([backTextRef.current, frontTextRef.current, badgeRef.current, scrollIndicatorRef.current], {
                opacity: 0,
            });
            gsap.set(backTextRef.current, { y: 40, scale: 0.95 });
            gsap.set(frontTextRef.current, { y: -20 });
            gsap.set(badgeRef.current, { y: 20 });
            gsap.set(scrollIndicatorRef.current, { y: 15 });

            tl.to(backTextRef.current, { opacity: 1, y: 0, scale: 1, duration: 1 })
                .to(badgeRef.current, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.5)" }, "-=0.6")
                .to(frontTextRef.current, { opacity: 1, y: 0, duration: 0.8 }, "-=0.3")
                .to(scrollIndicatorRef.current, { opacity: 0.6, y: 0, duration: 0.5 }, "-=0.2");
        });

        return () => ctx.revert();
    }, [mounted]);

    const onMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
        const btn = e.currentTarget;
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        gsap.to(btn, { x: x * 0.25, y: y * 0.25, duration: 0.3, ease: "power2.out" });
    };

    const onMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
        gsap.to(e.currentTarget, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
    };

    if (!mounted) {
        return <section className="relative h-[200vh] w-full bg-black"><Loader /></section>;
    }

    return (
        <section ref={containerRef} className="relative h-[200vh] w-full bg-black">
            <div className="sticky top-0 h-screen w-full overflow-hidden">
                {/* Background Glows */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="absolute -top-20 -left-20 w-64 h-64 md:w-[500px] md:h-[500px] bg-amber-500/20 rounded-full blur-[60px] md:blur-[120px] animate-pulse" />
                    <div className="absolute -bottom-20 -right-20 w-64 h-64 md:w-[400px] md:h-[400px] bg-purple-600/15 rounded-full blur-[60px] md:blur-[120px] animate-pulse" style={{ animationDelay: "1s" }} />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] md:w-[600px] md:h-[600px] bg-amber-400/10 rounded-full blur-[80px] md:blur-[150px]" />
                </div>

                {/* Grid Pattern */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:3rem_3rem] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_50%,#000_40%,transparent_100%)]" />

                {/* Background subtle text removed - VIDHI now in front */}

                {/* 3D Canvas */}
                <div className="absolute inset-0 z-[10]">
                    {webGL ? (
                        <Suspense fallback={<Loader />}>
                            <Canvas
                                camera={{ position: [0, 0.5, 6], fov: 42 }}
                                gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
                                style={{ background: "transparent" }}
                                onCreated={({ gl }) => {
                                    gl.domElement.addEventListener("webglcontextlost", () => setWebGL(false));
                                }}
                            >
                                <Scene scrollY={scrollY} />
                            </Canvas>
                        </Suspense>
                    ) : (
                        <CSSFallback />
                    )}
                </div>

                {/* Amity Badge - Positioned at top */}
                <div ref={badgeRef} className="opacity-0 absolute top-16 md:top-20 left-1/2 -translate-x-1/2 z-[50] inline-flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                    <span className="relative flex h-2 w-2 md:h-2.5 md:w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 md:h-2.5 md:w-2.5 bg-amber-500" />
                    </span>
                    <span className="text-[10px] md:text-sm tracking-widest uppercase text-white/60 whitespace-nowrap">
                        Amity Law School, Maharashtra
                    </span>
                </div>

                {/* Front Text Layer - shifted up to reduce model occlusion */}
                <div className="absolute inset-0 flex flex-col items-center justify-start pt-28 md:pt-36 z-[50] pointer-events-none px-4">
                    <div ref={frontTextRef} className="opacity-0 text-center w-full max-w-5xl mx-auto px-4">
                        {/* VIDHI - positioned above Dharmotsav */}
                        <h1 ref={backTextRef} className="text-5xl sm:text-7xl md:text-8xl lg:text-[9rem] font-serif italic tracking-tight mb-0 md:mb-2 leading-none p-2">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 filter drop-shadow-lg">
                                VIDHI
                            </span>
                        </h1>
                        <h2 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-serif italic leading-tight mb-4 md:mb-6">
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-300">
                                Dharmotsav
                            </span>
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-yellow-500 via-amber-400 to-yellow-500 ml-2 md:ml-4">
                                2.0
                            </span>
                        </h2>
                        <p className="text-base sm:text-lg md:text-xl text-white/80 w-full max-w-lg md:max-w-2xl mx-auto leading-relaxed font-medium tracking-wide">
                            A distinguished National Legal Festival celebrating the confluence of promising legal minds.
                        </p>
                    </div>
                </div>

                {/* Buttons - visible immediately */}
                <div ref={buttonsRef} className="opacity-0 absolute bottom-28 md:bottom-32 left-1/2 -translate-x-1/2 z-[30] flex flex-col sm:flex-row gap-3 md:gap-6 justify-center items-center w-full sm:w-auto px-6 pointer-events-auto">
                    <button
                        onClick={() => router.push("/about")}
                        onMouseMove={onMouseMove}
                        onMouseLeave={onMouseLeave}
                        className="group relative px-5 py-2.5 md:px-8 md:py-4 w-full sm:w-44 md:w-48 rounded-full overflow-hidden bg-white/5 border border-white/10 hover:border-amber-500/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(245,158,11,0.15)]"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                        <span className="relative z-10 text-white font-medium tracking-wide text-xs md:text-base group-hover:text-amber-200 transition-colors">
                            ABOUT US
                        </span>
                    </button>

                    <button
                        onClick={() => router.push("/register")}
                        onMouseMove={onMouseMove}
                        onMouseLeave={onMouseLeave}
                        className="group relative px-5 py-2.5 md:px-8 md:py-4 w-full sm:w-44 md:w-48 rounded-full overflow-hidden bg-gradient-to-r from-amber-500 to-yellow-600 hover:shadow-[0_0_40px_rgba(245,158,11,0.5)] transition-all duration-300"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        <span className="relative z-10 text-black font-bold tracking-wide text-xs md:text-base">
                            REGISTER NOW
                        </span>
                    </button>
                </div>

                {/* Scroll Indicator */}
                <div ref={scrollIndicatorRef} className="opacity-0 absolute bottom-6 md:bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-[25]">
                    <span className="text-[10px] md:text-xs tracking-widest uppercase text-white/40">Scroll</span>
                    <div className="w-4 h-6 md:w-5 md:h-8 rounded-full border border-white/20 flex items-start justify-center p-1">
                        <div className="w-0.5 md:w-1 h-1.5 md:h-2 bg-amber-400 rounded-full animate-bounce" />
                    </div>
                </div>

                {/* Bottom Gradient */}
                <div className="absolute bottom-0 w-full h-20 md:h-32 bg-gradient-to-t from-black via-black/80 to-transparent z-[15] pointer-events-none" />
            </div>
        </section>
    );
}

useGLTF.preload("/model.glb");
