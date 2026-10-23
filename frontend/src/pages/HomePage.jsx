import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useAnimation, useInView, AnimatePresence } from 'framer-motion';
import {
  Menu, X, Brain, Activity, Hand, Sparkles, Shield, Clock,
  BarChart3, Users, Award, ChevronDown, Play, CheckCircle,
  ArrowRight, Star, Github, Linkedin, Twitter, Youtube,
  Calendar, User, Camera, LineChart, TrendingUp, Dumbbell, Heart,
  Zap, Target, Monitor, Cloud, Lock, Home, Database,
  Settings, Bell, Flame, Award as AwardIcon, Stethoscope, ShieldCheck,
  Waves, MousePointer2, Gauge, Quote, ArrowUpRight, PlayCircle,
  CheckCircle2
} from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
  RoleModal — untouched (logic, structure, and visuals left exactly as-is)
  ────────────────────────────────────────────────────────────────────────── */
const RoleModal = ({ showRoleModal, setShowRoleModal }) => {
  const navigate = useNavigate();
  const [selectedRole, setSelectedRole] = useState("");
  const [hoveredRole, setHoveredRole] = useState(null);

  const roles = [
    {
      id: "patient",
      icon: User,
      label: "Patient",
      desc: "Access your rehab dashboard & exercises",
      color: "from-blue-500 to-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-500",
      text: "text-blue-700",
      ring: "ring-blue-200",
      gradient: "from-blue-500 via-blue-600 to-cyan-500",
      features: ["Guided exercises", "Daily recovery", "Progress tracking"],
      illustration: Activity,
    },
    {
      id: "therapist",
      icon: Stethoscope,
      label: "Therapist",
      desc: "Manage patients & rehabilitation plans",
      color: "from-teal-500 to-emerald-500",
      bg: "bg-teal-50",
      border: "border-teal-500",
      text: "text-teal-700",
      ring: "ring-teal-200",
      gradient: "from-teal-500 via-emerald-500 to-teal-400",
      features: ["Patient management", "AI assessment", "Reports"],
      illustration: Users,
      badge: "Most Popular",
    },
    {
      id: "admin",
      icon: ShieldCheck,
      label: "Admin",
      desc: "System monitoring & clinical oversight",
      color: "from-orange-400 to-orange-500",
      bg: "bg-orange-50",
      border: "border-orange-500",
      text: "text-orange-700",
      ring: "ring-orange-200",
      gradient: "from-orange-400 via-orange-500 to-amber-500",
      features: ["User management", "Clinic analytics", "Compliance"],
      illustration: BarChart3,
    },
  ];

  const selectedRoleData = roles.find((r) => r.id === selectedRole);

  const handleClose = () => {
    setShowRoleModal(false);
    setSelectedRole("");
  };

 const handleContinue = () => {
  if (!selectedRole) return;
  if (selectedRole === "patient") navigate("/patient");
  else if (selectedRole === "therapist") navigate("/therapist-login");
  else navigate("/login"); // admin
  handleClose();
};

  if (!showRoleModal) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Animated Background */}
      <div className="fixed inset-0 overflow-hidden">
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl"
          onClick={handleClose}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-teal-500/20 to-orange-400/20 animate-pulse" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/30 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/3 right-1/4 w-80 h-80 bg-teal-400/30 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-orange-300/20 rounded-full blur-3xl animate-pulse delay-2000" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMzLjMxNCAwIDYtMi42ODYgNi02cy0yLjY4Ni02LTYtNi02IDIuNjg2LTYgNiAyLjY4NiA2IDYgNnoiIGZpbGw9InJnYmEoMjU1LDI1NSwyNTUsMC4wNSkiLz48L2c+PC9zdmc+')] opacity-30" />
      </div>

      {/* Main Modal */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", damping: 25 }}
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white/95 backdrop-blur-2xl rounded-[32px] shadow-2xl shadow-slate-900/30 border border-white/20"
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-6 right-6 z-50 p-2 hover:bg-slate-100/80 rounded-full transition-all duration-300 hover:rotate-90"
        >
          <X className="w-5 h-5 text-slate-600" />
        </button>

        <div className="p-8 lg:p-12">
          {/* Header */}
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <Hand className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                  GestureHeal
                </p>
                <p className="text-[10px] text-slate-400 font-medium tracking-wider">
                  AI Rehabilitation Platform
                </p>
              </div>
            </div>

            <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 mb-3 tracking-tight">
              Welcome to GestureHeal
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl">
              Personalized rehabilitation powered by AI and trusted clinical
              workflows.
            </p>

            <div className="flex flex-wrap gap-3 mt-4">
              {[
                { icon: Shield, label: "Privacy Focused" },
                { icon: Lock, label: "Privacy Focused" },
                { icon: Sparkles, label: "AI Motion Tracking" },
              ].map((badge, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-white/80 backdrop-blur-sm border border-slate-200/80 rounded-full text-xs font-medium text-slate-700 shadow-sm"
                >
                  <badge.icon className="w-3 h-3 text-teal-500" />
                  {badge.label}
                </span>
              ))}
            </div>
          </div>

          {/* Role Selection */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-sm font-bold text-slate-700">
                  SELECT YOUR ROLE
                </p>
                <p className="text-2xl font-bold text-slate-900">
                  Choose Your Role
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <div className="w-8 h-0.5 bg-blue-500" />
                <div className="w-2 h-2 rounded-full bg-slate-200" />
                <div className="w-8 h-0.5 bg-slate-200" />
                <div className="w-2 h-2 rounded-full bg-slate-200" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {roles.map((role, index) => {
                const Icon = role.icon;
                const Illustration = role.illustration;
                const isSelected = selectedRole === role.id;
                const isHovered = hoveredRole === role.id;

                return (
                  <motion.button
                    key={role.id}
                    onClick={() => setSelectedRole(role.id)}
                    onHoverStart={() => setHoveredRole(role.id)}
                    onHoverEnd={() => setHoveredRole(null)}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`relative p-6 rounded-2xl border-2 transition-all duration-300 text-left group ${
                      isSelected
                        ? `border-${role.id === 'patient' ? 'blue' : role.id === 'therapist' ? 'teal' : 'orange'}-500 bg-${
                            role.id === 'patient' ? 'blue' : role.id === 'therapist' ? 'teal' : 'orange'
                          }-50/80 shadow-xl shadow-${
                            role.id === 'patient' ? 'blue' : role.id === 'therapist' ? 'teal' : 'orange'
                          }-500/20 scale-[1.02]`
                        : "border-slate-200/80 hover:border-blue-300 hover:shadow-lg hover:shadow-slate-200/50 bg-white/60 backdrop-blur-sm"
                    }`}
                  >
                    {role.badge && (
                      <div className="absolute -top-3 -right-3 px-3 py-1 bg-gradient-to-r from-teal-500 to-emerald-500 rounded-full text-[10px] font-bold text-white shadow-lg shadow-teal-500/30 z-10">
                        {role.badge}
                      </div>
                    )}

                    <div className="flex items-start gap-4">
                      <div
                        className={`w-14 h-14 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center shadow-lg ${
                          isSelected ? `shadow-${role.id === 'patient' ? 'blue' : role.id === 'therapist' ? 'teal' : 'orange'}-500/30` : ""
                        }`}
                      >
                        <Icon className="w-7 h-7 text-white" />
                      </div>

                      <div className="flex-1">
                        <h3 className="text-xl font-bold text-slate-900 mb-1">
                          {role.label}
                        </h3>
                        <p className="text-sm text-slate-500 mb-3">
                          {role.desc}
                        </p>

                        <ul className="space-y-1.5">
                          {role.features.map((feature, i) => (
                            <li
                              key={i}
                              className="flex items-center gap-2 text-xs text-slate-600"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-500" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {isSelected && (
                      <motion.div
                        layoutId="selectedIndicator"
                        className="absolute top-4 right-4 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center shadow-lg shadow-blue-500/30"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", damping: 15 }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-white" />
                      </motion.div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Trust Section */}
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { 
                  icon: Shield, 
                  label: "Privacy Focused", 
                  desc: "Enterprise-grade security",
                  color: "blue" 
                },
                { 
                  icon: Lock, 
                  label: "Your privacy matters", 
                  desc: "Your data is protected",
                  color: "teal" 
                },
                { 
                  icon: Brain, 
                  label: "AI Powered", 
                  desc: "Intelligent rehabilitation",
                  color: "orange" 
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 bg-white/60 backdrop-blur-sm rounded-xl border border-slate-200/50 hover:border-blue-200 transition-all"
                >
                  <div className={`w-8 h-8 rounded-lg bg-${item.color}-50 flex items-center justify-center`}>
                    <item.icon className={`w-4 h-4 text-${item.color}-500`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">{item.label}</p>
                    <p className="text-[10px] text-slate-400">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Continue Button */}
          <motion.button
            onClick={handleContinue}
            disabled={!selectedRole}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all duration-300 group overflow-hidden ${
              selectedRole
                ? `bg-gradient-to-r ${selectedRoleData?.gradient} text-white shadow-lg shadow-${
                    selectedRole === 'patient' ? 'blue' : selectedRole === 'therapist' ? 'teal' : 'orange'
                  }-500/30 hover:shadow-xl hover:shadow-${
                    selectedRole === 'patient' ? 'blue' : selectedRole === 'therapist' ? 'teal' : 'orange'
                  }-500/40`
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            <span className="relative z-10">
              Continue as {selectedRoleData?.label || "..."}
            </span>
            <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
            {selectedRole && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
            )}
          </motion.button>

          <p className="text-center text-[10px] text-slate-400 mt-4 flex items-center justify-center gap-1.5">
            <Lock className="w-3 h-3" />
            Your privacy matters
          </p>
        </div>
      </motion.div>
    </div>
  );
};


/* ──────────────────────────────────────────────────────────────────────────
  Design system (visual layer only)
  - Palette: navy #0C3C44 (text, buttons, dark bands), mauve #FFC857 (accent), blush #FFD8C7 (soft surfaces),
    on white. No competing accents.
  - Section rhythm alternates white and slate-50; every section shares the
    same eyebrow → headline → body pattern.
  ────────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = ['Home', 'Services', 'How It Works', 'AI Technology', 'Testimonials', 'FAQ', 'Contact'];
const anchor = (l) => `#${l.toLowerCase().replace(/\s+/g, '-')}`;

const SectionHead = ({ eyebrow, title, body, center = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    className={`max-w-2xl mb-14 ${center ? 'mx-auto text-center' : ''}`}
  >
    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#137F7E] uppercase tracking-[0.14em]">
      <span className="w-6 h-px bg-[#126267]" />
      {eyebrow}
    </span>
    <h2 className="text-3xl md:text-[2.5rem] font-bold tracking-tight text-[#0C3C44] mt-3 leading-[1.15]">{title}</h2>
    {body && <p className="text-slate-600 mt-4 leading-relaxed text-[16px]">{body}</p>}
  </motion.div>
);

const HomePage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll: begins after the hero video finishes its first play-through.
  // Mouse movement, wheel and touch do NOT stop it; clicking a button or link does.
  useEffect(() => {
    if (!autoScroll) return;
    const SPEED = 60; // pixels per second (raise = faster)
    let raf, last = null, pos = window.scrollY, stopped = false;

    const step = (now) => {
      if (stopped) return;
      if (last !== null) {
        // if the user scrolled by hand, carry on from where they are
        if (Math.abs(window.scrollY - pos) > 2) pos = window.scrollY;
        pos += (SPEED * (now - last)) / 1000;
        window.scrollTo({ top: pos, behavior: 'instant' });
        if (pos >= document.documentElement.scrollHeight - window.innerHeight) return;
      }
      last = now;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const onClick = (e) => {
      if (e.target.closest('button, a')) {
        stopped = true;
        cancelAnimationFrame(raf);
      }
    };
    document.addEventListener('click', onClick, true);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('click', onClick, true);
    };
  }, [autoScroll]);

  return (
    <div className="min-h-screen bg-white font-sans antialiased overflow-x-hidden text-[#0C3C44] scroll-smooth">
      <RoleModal showRoleModal={showRoleModal} setShowRoleModal={setShowRoleModal} />
      <Navbar scrolled={scrolled} isOpen={isOpen} setIsOpen={setIsOpen} setShowRoleModal={setShowRoleModal} />
      <Hero setShowRoleModal={setShowRoleModal} onVideoComplete={() => setAutoScroll(true)} />
      <Services />
      <WhyGestureHeal />
      <Workflow setShowRoleModal={setShowRoleModal} />
      <DashboardPreview />
      <Conditions />
      <Statistics />
      <Testimonials />
      <FAQ activeFaq={activeFaq} setActiveFaq={setActiveFaq} />
      <CTA setShowRoleModal={setShowRoleModal} />
      <Footer />
    </div>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Navbar — thin trust bar + main bar
  ────────────────────────────────────────────────────────────────────────── */
const Navbar = ({ scrolled, isOpen, setIsOpen, setShowRoleModal }) => {
  const navigate = useNavigate();

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 inset-x-0 z-50"
    >
      <nav className={`bg-white/95 backdrop-blur-md border-b transition-shadow ${scrolled ? 'border-[#F3DDD1] shadow-[0_4px_20px_rgba(15,23,42,0.06)]' : 'border-[#F7E9E1]'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div
              className="flex items-center gap-2.5 cursor-pointer"
              onClick={() => {
                if (window.location.pathname === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
                else navigate('/');
              }}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#126267] to-[#0F4F55] flex items-center justify-center shadow-md shadow-[#0C3C44]/25">
                <Activity className="w-5 h-5 text-white" strokeWidth={2.25} />
              </div>
              <div className="leading-tight">
                <span className="block text-[16px] font-bold tracking-tight text-[#0C3C44]">Gesture Heal</span>
                <span className="block text-[10px] font-medium text-slate-500 tracking-wide">AI Rehabilitation</span>
              </div>
            </div>

            <div className="hidden lg:flex items-center gap-0.5">
              {NAV_LINKS.map((link) => (
                <a
                  key={link}
                  href={anchor(link)}
                  className="px-3 py-2 text-[13.5px] font-medium text-slate-600 hover:text-[#137F7E] rounded-lg hover:bg-[#FFF4EE] transition-colors"
                >
                  {link}
                </a>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-2">

              <motion.button
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRoleModal(true)}
                className="px-5 py-2.5 text-[13.5px] font-semibold text-white bg-[#137F7E] hover:bg-[#0E6666] rounded-lg shadow-md shadow-[#0C3C44]/20 transition-colors"
              >
                Get started
              </motion.button>
            </div>

            <button className="lg:hidden p-2 -mr-2 text-slate-700" onClick={() => setIsOpen(!isOpen)} aria-label="Toggle menu">
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden bg-white border-t border-[#F7E9E1] overflow-hidden"
            >
              <div className="px-5 py-4 space-y-1">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link}
                    href={anchor(link)}
                    className="block py-2.5 text-[15px] font-medium text-slate-700 hover:text-[#137F7E] transition-colors"
                    onClick={() => setIsOpen(false)}
                  >
                    {link}
                  </a>
                ))}
                <div className="pt-4 flex gap-3">

                  <button onClick={() => setShowRoleModal(true)} className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#137F7E] rounded-lg">
                    Get started
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </motion.header>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Hero — video background kept, light overlay
  ────────────────────────────────────────────────────────────────────────── */
const Hero = ({ setShowRoleModal, onVideoComplete }) => {
  const controls = useAnimation();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const lastTime = useRef(0);
  const finished = useRef(false);

  // The video loops, so "finished" = playback wrapped back to the start
  const handleTimeUpdate = (e) => {
    const t = e.currentTarget.currentTime;
    if (!finished.current && t < lastTime.current) {
      finished.current = true;
      onVideoComplete?.();
    }
    lastTime.current = t;
  };

  useEffect(() => {
    if (inView) controls.start('visible');
  }, [controls, inView]);


  return (
    <section ref={ref} id="home" className="relative mt-[64px] aspect-video overflow-hidden bg-[#02060f] scroll-mt-24 flex items-center">
      <video
        autoPlay loop muted playsInline
        onTimeUpdate={handleTimeUpdate}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ objectPosition: 'center 20%', filter: 'brightness(1) contrast(1.08) saturate(1.15)' }}
      >
        <source src="/intro_video1.mp4" type="video/mp4" />
      </video>
      {/* minimal overlay: video stays sharp; only a soft teal-navy gradient behind the text on the left */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#082B31]/80 via-[#082B31]/35 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#082B31]/40 to-transparent" />

      <div className="relative w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-2xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#FFD8C7] text-[12.5px] font-semibold text-[#0E6666] shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-[#1A9594]" />
              AI-assisted physiotherapy, supervised by clinicians
            </span>


          </motion.div>

        </div>

      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Services
  ────────────────────────────────────────────────────────────────────────── */
const Services = () => {
  const services = [
    { icon: Brain, title: 'AI motion analysis', description: 'Computer vision tracks your movement with clinical precision, flagging form issues the moment they happen.' },
    { icon: Hand, title: 'Gesture recognition', description: 'Navigate exercises and log reps with hand gestures alone — no controller, no touchscreen required.' },
    { icon: Monitor, title: 'Remote therapy', description: 'Secure video sessions with licensed therapists, backed by AI progress notes between appointments.' },
    { icon: TrendingUp, title: 'Recovery tracking', description: 'A single dashboard charts your trajectory, surfacing milestones the moment you hit them.' },
    { icon: BarChart3, title: 'Progress reports', description: 'Automated weekly summaries highlight what improved and what still needs attention.' },
    { icon: Dumbbell, title: 'Adaptive exercise plans', description: 'Your program recalibrates session to session, always tuned to the edge of your capability.' },
  ];

  return (
    <section id="services" className="py-24 lg:py-28 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="What's included" title="Everything recovery needs, nothing it doesn't." body="A complete rehabilitation toolkit for patients, therapists and clinics." />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: (i % 3) * 0.08 }}
              whileHover={{ y: -4 }}
              className="group relative p-7 rounded-2xl bg-white border border-[#F3DDD1] hover:border-[#FFC857] hover:shadow-xl hover:shadow-[#082B31]/5 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-[#FFF4EE] text-[#137F7E] flex items-center justify-center mb-5 group-hover:bg-[#137F7E] group-hover:text-white transition-colors">
                <s.icon className="w-6 h-6" strokeWidth={1.75} />
              </div>
              <h3 className="text-[17px] font-semibold text-[#0C3C44] mb-2">{s.title}</h3>
              <p className="text-[14.5px] text-slate-600 leading-relaxed">{s.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Why Gesture Heal
  ────────────────────────────────────────────────────────────────────────── */
const WhyGestureHeal = () => {
  const features = [
    { icon: Monitor, title: 'No wearables', description: 'Just a camera' },
    { icon: Brain, title: 'AI-adaptive', description: 'Adjusts in real time' },
    { icon: Home, title: 'Home-based', description: 'Recover anywhere' },
    { icon: Award, title: 'Doctor-approved', description: 'Clinically validated' },
    { icon: Cloud, title: 'Cloud sync', description: 'Progress, everywhere' },
    { icon: Zap, title: 'Faster gains', description: 'Accelerated protocols' },
    { icon: Lock, title: 'Secure', description: 'Privacy Focused' },
    { icon: Users, title: 'Inclusive', description: 'Built for all abilities' },
  ];

  return (
    <section className="py-24 lg:py-28 bg-[#FFF9F5] border-y border-[#F7E9E1]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-16 items-start">
          <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="lg:sticky lg:top-32">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#137F7E] uppercase tracking-[0.14em]">
              <span className="w-6 h-px bg-[#126267]" /> Why Gesture Heal
            </span>
            <h2 className="text-3xl md:text-[2.5rem] font-bold tracking-tight text-[#0C3C44] mt-3 leading-[1.15]">
              Built like clinical software. Feels like coaching.
            </h2>
            <p className="text-slate-600 mt-4 leading-relaxed max-w-sm">
              Every detail — from how data is stored to how feedback is delivered — is designed around trust.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -3 }}
                className="bg-white p-5 rounded-xl border border-[#F3DDD1] hover:border-[#FFC857] hover:shadow-lg hover:shadow-[#082B31]/5 transition-all"
              >
                <div className="w-9 h-9 rounded-lg bg-[#FFF4EE] text-[#137F7E] flex items-center justify-center mb-3.5">
                  <f.icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
                </div>
                <h3 className="font-semibold text-[14px] text-[#0C3C44] mb-0.5">{f.title}</h3>
                <p className="text-[12.5px] text-slate-500">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Workflow
  ────────────────────────────────────────────────────────────────────────── */
const Workflow = ({ setShowRoleModal }) => {
  const steps = [
    { icon: User, title: 'Patient signs in', description: 'Start a session from any device with a camera' },
    { icon: Camera, title: 'Camera calibrates', description: 'AI locates and tracks your body in frame' },
    { icon: Brain, title: 'Pose is detected', description: '17-point skeletal tracking maps your form' },
    { icon: Activity, title: 'Movement is scored', description: 'Each rep is evaluated against your protocol' },
    { icon: Sparkles, title: 'Feedback is live', description: 'Corrections appear the moment form drifts' },
    { icon: BarChart3, title: 'Progress is logged', description: 'Every session adds to your recovery curve' },
    { icon: Users, title: 'Clinician reviews', description: 'Your therapist adjusts the plan as needed' },
  ];

  return (
    <section id="how-it-works" className="py-24 lg:py-28 bg-white scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="How it works" title="One session, start to finish." body="From sign-in to clinician review, every step is automated, measured and recorded." />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.07 }}
              whileHover={{ y: -4 }}
              className="relative p-6 rounded-2xl bg-[#FFF9F5] border border-[#F3DDD1] hover:bg-white hover:border-[#FFC857] hover:shadow-lg hover:shadow-[#082B31]/5 transition-all"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="w-11 h-11 rounded-xl bg-white border border-[#F3DDD1] text-[#137F7E] flex items-center justify-center shadow-sm">
                  <s.icon className="w-5 h-5" strokeWidth={1.75} />
                </div>
                <span className="text-3xl font-bold text-slate-200 tabular-nums">0{i + 1}</span>
              </div>
              <h3 className="text-[16px] font-semibold text-[#0C3C44]">{s.title}</h3>
              <p className="text-[14px] text-slate-600 mt-1.5 leading-relaxed">{s.description}</p>
            </motion.div>
          ))}

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            whileHover={{ y: -4 }}
            onClick={() => setShowRoleModal(true)}
            className="text-left p-6 rounded-2xl bg-gradient-to-br from-[#0C3C44] to-[#082B31] text-white shadow-lg shadow-[#082B31]/20 flex flex-col justify-between"
          >
            <ArrowUpRight className="w-6 h-6 text-[#FFD8C7]" />
            <div className="mt-8">
              <h3 className="text-[17px] font-semibold">Start your first session</h3>
              <p className="text-[13.5px] text-[#FFD8C7]/80 mt-1">Pick your role and get going in minutes.</p>
            </div>
          </motion.button>
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Dashboard preview
  ────────────────────────────────────────────────────────────────────────── */
const DashboardPreview = () => (
  <section id="ai-technology" className="py-24 lg:py-28 bg-[#FFF9F5] border-y border-[#F7E9E1] relative overflow-hidden scroll-mt-24">
    <div className="absolute -top-32 -right-32 w-[28rem] h-[28rem] bg-[#FFD8C7]/70 rounded-full blur-3xl" />
    <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <SectionHead eyebrow="The dashboard" title="Your recovery, quantified." body="Every metric a therapist would track by hand, computed automatically and updated after every session." />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="rounded-2xl overflow-hidden border border-[#F3DDD1] shadow-2xl shadow-slate-900/10 bg-white"
      >
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[#F7E9E1] bg-[#FFF9F5]">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
          </div>
          <div className="ml-3 flex items-center gap-1.5 px-3 py-1 rounded-md bg-white border border-[#F3DDD1] text-[11px] text-slate-500 font-mono">
            <Lock className="w-3 h-3 text-[#1A9594]" /> app.gestureheal.com/admin
          </div>
        </div>
        <img src="/admin-dashboard.png.jpeg" alt="Gesture Heal admin dashboard" className="w-full h-auto block" />
      </motion.div>
    </div>
  </section>
);

/* ──────────────────────────────────────────────────────────────────────────
  Conditions
  ────────────────────────────────────────────────────────────────────────── */
const Conditions = () => {
  const conditions = [
    { icon: '🥶', title: 'Frozen shoulder', desc: 'Gentle, pain-free stretching', photo: '/frozen.jpeg' },
    { icon: '🦾', title: 'Shoulder impingement', desc: 'Mobility & pain-free motion', photo: '/shoulder%20mobility.jpeg' },
    { icon: '💪', title: 'Rotator cuff', desc: 'Shoulder strength & mobility', photo: '/rotator.jpeg' },
    { icon: '🧠', title: 'Stroke rehab', desc: 'Motor function & coordination', photo: '/stroke.jpeg' },
    { icon: '✋', title: 'Hand surgery', desc: 'Fine motor skill recovery', photo: '/hand%20surgery.jpeg' },
    { icon: '🦴', title: 'Fracture recovery', desc: 'Guided bone healing support', photo: '/fracture%20recovery.jpeg' },
    { icon: '⚡', title: 'Nerve injury', desc: 'Sensation & nerve function', photo: '/nerve%20injury.jpeg' },
    { icon: '🤲', title: 'Wrist rehab', desc: 'Strength & flexibility', photo: '/wrist.jpeg' },
    { icon: '🧘', title: "Parkinson's", desc: 'Symptom & mobility management', photo: '/parkisons.jpeg' },
  ];

  return (
    <section className="py-24 lg:py-28 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="Conditions" title="Conditions we support" body="Evidence-based protocols across orthopaedic and neurological recovery." />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {conditions.map((c, i) => (
            <motion.div
              key={c.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 3) * 0.06 }}
              whileHover={{ y: -4 }}
              className="group bg-white rounded-2xl border border-[#F3DDD1] hover:border-[#FFC857] shadow-sm hover:shadow-xl hover:shadow-[#082B31]/5 transition-all overflow-hidden"
            >
              <div className="relative w-full aspect-[3/2] overflow-hidden flex items-center justify-center text-7xl bg-gradient-to-br from-[#FFF4EE] to-slate-100">
                <span>{c.icon}</span>
                {c.photo && (
                  <img
                    src={c.photo}
                    alt={c.title}
                    className="absolute inset-0 w-full h-full object-cover bg-[#FCEDE5] group-hover:scale-105 transition-transform duration-500"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
              <div className="p-5 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[15.5px] text-[#0C3C44]">{c.title}</h3>
                  <p className="text-[13.5px] text-slate-500 mt-0.5">{c.desc}</p>
                </div>
                <ArrowUpRight className="w-5 h-5 text-slate-300 group-hover:text-[#1A9594] transition-colors flex-shrink-0" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Statistics
  ────────────────────────────────────────────────────────────────────────── */
const StatCard = ({ stat, index }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const end = stat.number;
    const increment = end / (1600 / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(stat.decimals ? Number(start.toFixed(stat.decimals)) : Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, stat.number, stat.decimals]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className={`text-left ${index > 0 ? 'sm:border-l sm:border-white/15 sm:pl-8' : ''}`}
    >
      <stat.icon className="w-5 h-5 text-[#FFC857] mb-4" strokeWidth={1.75} />
      <div className="text-4xl md:text-5xl font-bold tracking-tight tabular-nums">
        {count.toLocaleString(undefined, { minimumFractionDigits: stat.decimals || 0, maximumFractionDigits: stat.decimals || 0 })}{stat.suffix}
      </div>
      <div className="text-sm text-white/65 mt-1.5">{stat.label}</div>
    </motion.div>
  );
};

const Statistics = () => {
  const stats = [
    { number: 9, label: 'Active patients', suffix: '', icon: Users },
    { number: 28, label: "Today's sessions", suffix: '', icon: Activity },
    { number: 337, label: 'Total sessions completed', suffix: '', icon: Calendar },
    { number: 33.3, label: 'Engagement rate', suffix: '%', icon: TrendingUp, decimals: 1 },
  ];

  return (
    <section className="py-20 lg:py-24 bg-gradient-to-br from-[#082B31] via-[#0C3C44] to-[#1B5A60] relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{ backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 sm:gap-0 text-white">
          {stats.map((s, i) => <StatCard key={s.label} stat={s} index={i} />)}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Testimonials
  ────────────────────────────────────────────────────────────────────────── */
const Testimonials = () => {
  const patients = [
    { name: 'Emma Clarke', role: 'Stroke Rehabilitation', image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Daniel Moreno', role: 'Rotator Cuff', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Robert Hansen', role: 'Frozen Shoulder', image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Lucas Fernandez', role: 'Fracture Recovery', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Sophie Laurent', role: 'Wrist Rehabilitation', image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Marcus Weber', role: 'Frozen Shoulder', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&h=750&fit=crop&crop=faces' },
    { name: 'Olivia Bennett', role: 'Frozen Shoulder', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=600&h=750&fit=crop&crop=faces' },
    { name: 'James Whitaker', role: 'Shoulder Impingement', image: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=600&h=750&fit=crop&crop=faces' },
  ];

  return (
    <section id="testimonials" className="py-24 lg:py-28 bg-[#FFF9F5] border-y border-[#F7E9E1] scroll-mt-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead eyebrow="In their words" title="Recovery, told first-hand." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {patients.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (i % 4) * 0.06 }}
              whileHover={{ y: -4 }}
              className="bg-white rounded-2xl border border-[#F3DDD1] hover:border-[#FFC857] shadow-sm hover:shadow-xl hover:shadow-[#082B31]/5 transition-all overflow-hidden flex flex-col"
            >
              <div className="w-full aspect-[4/5] overflow-hidden bg-[#FCEDE5]">
                <img src={p.image} alt={p.name} className="w-full h-full object-cover" style={{ objectPosition: 'center 20%' }} />
              </div>
              <div className="p-4 text-center h-[96px] flex flex-col items-center justify-center">
                <div className="font-semibold text-[16px] text-[#0C3C44]">{p.name}</div>
                <span className="mt-2 inline-block px-3 py-1 rounded-full bg-[#FFF4EE] text-[#0E6666] text-[12px] font-medium">{p.role}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  FAQ
  ────────────────────────────────────────────────────────────────────────── */
const FAQ = ({ activeFaq, setActiveFaq }) => {
  const faqs = [
    { q: 'How does Gesture Heal work?', a: "Gesture Heal uses AI and computer vision to analyze your movements through your device's camera. The system provides real-time feedback and personalized exercise programs to help you recover effectively from the comfort of your home." },
    { q: 'Is my data secure and private?', a: 'Yes, Gesture Heal is fully Privacy Focused. All your health data Your privacy matters and stored securely. We never share your information with third parties without your explicit consent.' },
    { q: 'Do I need any special equipment?', a: 'No, you only need a device with a camera (smartphone, tablet, or computer) and an internet connection. Our AI technology works with standard cameras to track your movements.' },
    { q: 'What conditions can Gesture Heal help with?', a: "Gesture Heal supports rehabilitation for stroke, knee injuries, shoulder rehabilitation, hand therapy, post-surgery recovery, Parkinson's disease." },
    { q: 'How is this different from traditional physical therapy?', a: 'Gesture Heal combines the convenience of remote therapy with AI-powered analysis and real-time feedback. You get the benefits of professional guidance with the flexibility of home-based rehabilitation.' },
    { q: 'Can I use Gesture Heal alongside my regular therapy?', a: 'Yes, Gesture Heal is designed to complement traditional therapy. Many patients use it between appointments to maintain consistency and track their progress.' },
  ];

  return (
    <section id="faq" className="py-24 lg:py-28 bg-white scroll-mt-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHead center eyebrow="Questions" title="Frequently asked questions" />
        <div className="space-y-3">
          {faqs.map((faq, i) => {
            const open = activeFaq === i;
            return (
              <motion.div
                key={faq.q}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.03 }}
                className={`rounded-xl border overflow-hidden transition-colors ${open ? 'border-[#FFC857] bg-[#FFF4EE]/40' : 'border-[#F3DDD1] bg-white hover:border-[#EBC9B8]'}`}
              >
                <button
                  className="w-full px-6 py-5 flex items-center justify-between gap-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFC857]/50"
                  onClick={() => setActiveFaq(open ? null : i)}
                  aria-expanded={open}
                >
                  <span className="font-semibold text-[16px] text-[#0C3C44]">{faq.q}</span>
                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }} className="flex-shrink-0">
                    <ChevronDown className={`w-5 h-5 ${open ? 'text-[#137F7E]' : 'text-slate-400'}`} />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="px-6 pb-6 text-slate-600 leading-relaxed text-[15px]">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  CTA
  ────────────────────────────────────────────────────────────────────────── */
const CTA = ({ setShowRoleModal }) => (
  <section id="contact" className="pb-24 lg:pb-28 bg-white scroll-mt-24">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative rounded-3xl px-8 py-16 sm:px-16 sm:py-20 overflow-hidden shadow-xl shadow-[#082B31]/15"
      >
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1600&q=80&fit=crop')" }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#082B31]/95 via-[#0F4F55]/90 to-[#0C3C44]/70" />
        <div className="relative max-w-2xl">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.1] mb-5">Ready to begin?</h2>
          <p className="text-lg text-white/80 mb-10 max-w-md leading-relaxed">
            A free assessment takes five minutes and gives you a personalized recovery plan the same day.
          </p>
          <div className="flex flex-wrap gap-4">
            <motion.button
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowRoleModal(true)}
              className="px-7 py-3.5 text-[15px] font-semibold bg-white text-[#0C3C44] rounded-xl shadow-lg shadow-black/20 flex items-center gap-2"
            >
              Start free assessment <ArrowUpRight className="w-4 h-4" />
            </motion.button>
            <button className="px-7 py-3.5 text-[15px] font-semibold text-white border border-white/40 rounded-xl hover:bg-white/10 transition-colors">
              Book a consultation
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

/* ──────────────────────────────────────────────────────────────────────────
  Footer
  ────────────────────────────────────────────────────────────────────────── */
const Footer = () => (
  <footer className="bg-[#0C3C44] text-white">
    <div className="max-w-7xl mx-auto px-6 lg:px-8 py-14">
      <div className="grid md:grid-cols-[1.4fr_1fr_1fr] gap-10">
        <div>
          <a href="/" className="inline-flex items-center gap-3 mb-5 hover:opacity-90 transition">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1FA7A6] to-[#0C3C44] flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold">Gesture Heal</span>
          </a>
          <p className="max-w-md text-[15px] leading-7 text-white/65">
            AI-powered rehabilitation platform that empowers patients with intelligent gesture recognition, personalized therapy, and seamless progress tracking for faster recovery.
          </p>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FFC857] mb-4">Explore</h4>
          <ul className="space-y-2.5">
            {NAV_LINKS.slice(1).map((l) => (
              <li key={l}><a href={anchor(l)} className="text-[14.5px] text-white/70 hover:text-white transition-colors">{l}</a></li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#FFC857] mb-4">Trust & security</h4>
          <ul className="space-y-3 text-[14.5px] text-white/70">
            <li className="flex items-center gap-2.5"><ShieldCheck className="w-4 h-4 text-[#FFC857]" /> Privacy Focused</li>
            <li className="flex items-center gap-2.5"><Lock className="w-4 h-4 text-[#FFC857]" /> Privacy Focused</li>
            <li className="flex items-center gap-2.5"><Stethoscope className="w-4 h-4 text-[#FFC857]" /> Clinician supervised</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/10 mt-12 pt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <p className="text-sm text-white/70">© 2026 Gesture Heal. All rights reserved.</p>
        <p className="text-xs text-white/45">Not a substitute for professional medical advice.</p>
      </div>
    </div>
  </footer>
);

export default HomePage;