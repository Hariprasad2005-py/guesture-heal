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
                { icon: Shield, label: "HIPAA Ready" },
                { icon: Lock, label: "End-to-End Encryption" },
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
                  label: "HIPAA Compliant", 
                  desc: "Enterprise-grade security",
                  color: "blue" 
                },
                { 
                  icon: Lock, 
                  label: "End-to-End Encrypted", 
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
            Your data is encrypted and HIPAA compliant
          </p>
        </div>
      </motion.div>
    </div>
  );
};


/* ──────────────────────────────────────────────────────────────────────────
  Design tokens (visual layer only)
  - One consistent identity throughout: warm cream base (#FAF8F3) with a
    single tint step (#F3EFE6) used to separate sections instead of a
    different hue per block. Two accent colors only — teal for trust/clinical
    signal, coral (#FF7043) for warmth/action — no incidental purples,
    blues, or ambers.
  ────────────────────────────────────────────────────────────────────────── */

const HomePage = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeFaq, setActiveFaq] = useState(null);
  const [showRoleModal, setShowRoleModal] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF8F3] font-sans antialiased overflow-x-hidden text-slate-900">
      <RoleModal showRoleModal={showRoleModal} setShowRoleModal={setShowRoleModal} />
      <Navbar scrolled={scrolled} isOpen={isOpen} setIsOpen={setIsOpen} setShowRoleModal={setShowRoleModal} />
      <Hero setShowRoleModal={setShowRoleModal} />
      <Services />
      <WhyGestureHeal />
      <Workflow />
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
  Navbar
  ────────────────────────────────────────────────────────────────────────── */
const Navbar = ({ scrolled, isOpen, setIsOpen, setShowRoleModal }) => {
  const navLinks = ['Home', 'Services', 'How It Works', 'AI Technology', 'Testimonials', 'FAQ', 'Contact'];

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-0 left-0 right-0 z-50 bg-[#FAF8F3] border-b border-black/5 shadow-sm"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-[72px]">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-[#FF8A65] flex items-center justify-center shadow-md shadow-teal-500/30">
              <Activity className="w-5 h-5 text-white" strokeWidth={2.25} />
            </div>
            <span className="text-[17px] font-bold tracking-tight text-slate-900">
              Gesture Heal
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                className="px-3.5 py-2 text-[13.5px] font-medium text-slate-600 hover:text-teal-600 rounded-full hover:bg-teal-50 transition-colors"
              >
                {link}
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={() => setShowRoleModal(true)}
              className="px-4 py-2 text-[13.5px] font-semibold text-slate-700 hover:text-teal-600 transition-colors"
            >
              Log in
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowRoleModal(true)}
              className="px-5 py-2.5 text-[13.5px] font-semibold text-white bg-gradient-to-r from-teal-500 to-[#FF7043] rounded-full shadow-md shadow-[#FF7043]/20 hover:shadow-lg hover:shadow-[#FF7043]/30 transition-all"
            >
              Get started
            </motion.button>
          </div>

          <button className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
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
            className="md:hidden bg-[#FAF8F3]/95 backdrop-blur-xl border-t border-slate-900/5"
          >
            <div className="px-5 py-5 space-y-1">
              {navLinks.map((link) => (
                <a
                  key={link}
                  href={`#${link.toLowerCase().replace(/\s+/g, '-')}`}
                  className="block py-2.5 text-[15px] font-medium text-slate-700 hover:text-teal-600 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  {link}
                </a>
              ))}
              <div className="pt-4 flex gap-3">
                <button
                  onClick={() => setShowRoleModal(true)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 rounded-full"
                >
                  Log in
                </button>
                <button
                  onClick={() => setShowRoleModal(true)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-500 to-[#FF7043] rounded-full"
                >
                  Get started
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Hero — signature element: a live "vitals" readout panel anchored beside
  the headline, replacing the generic floating-badge-over-photo pattern.
  ────────────────────────────────────────────────────────────────────────── */
const Hero = ({ setShowRoleModal }) => {
  const controls = useAnimation();
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) controls.start('visible');
  }, [controls, inView]);

  return (
    <section ref={ref} id="home" className="relative min-h-screen pt-[72px] overflow-hidden bg-black">
      {/* video background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'brightness(1.35) contrast(1.05)' }}
      >
        <source src="/intro_video.mp4" type="video/mp4" />
      </video>

      {/* dark overlay for text legibility */}
      <div className="absolute inset-0 bg-black/30" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/20 to-transparent" />

      <div className="relative max-w-full mx-auto px-6 sm:px-10 lg:px-16 h-full min-h-[calc(100vh-72px)] flex flex-col justify-between py-14">
        <div className="mt-10" />

        {/* bottom row: description + CTAs on left, stat badges on right */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8"
        >
          <div className="max-w-xl">
            <h1 className="font-serif text-[2.25rem] leading-[1.1] sm:text-4xl lg:text-5xl font-bold text-white mb-3">
              Recovery, read
              <br />
              in real time.
            </h1>

            <p className="text-[#FFD4C2] text-[15px] sm:text-base font-medium mb-6">
              AI-powered rehabilitation — accurate, accessible, anywhere.
            </p>

            <div className="flex flex-wrap gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRoleModal(true)}
                className="px-6 py-3 text-[14px] font-semibold text-white bg-[#FF7043] rounded-lg shadow-lg shadow-[#FF7043]/30 hover:bg-[#F4511E] transition-colors"
              >
                Start your recovery
              </motion.button>
            </div>
          </div>

          {/* stat badges */}
          <div className="flex gap-3 flex-shrink-0">
            {[
              { value: '96%', label: 'FORM ACCURACY' },
              { value: 'Real-time', label: 'AI FEEDBACK' },
              { value: '17', label: 'TRACKED KEYPOINTS' },
            ].map((stat, i) => (
              <div
                key={i}
                className="px-5 py-3.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-sm text-center min-w-[100px]"
              >
                <div className="text-xl font-bold text-[#FFB89C]">{stat.value}</div>
                <div className="text-[10px] text-white/60 mt-1 tracking-wide leading-tight">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Services — top accent bar, colorful icon tile, consistent rhythm
  ────────────────────────────────────────────────────────────────────────── */
const Services = () => {
  const services = [
    {
      icon: <Brain className="w-5 h-5" strokeWidth={1.75} />,
      title: 'AI motion analysis',
      description: 'Computer vision tracks your movement with clinical precision, flagging form issues the moment they happen.',
      accent: 'bg-[#FF7043]',
      tint: 'from-[#FF7043] to-[#FF8A65]',
      hoverBorder: 'hover:border-[#FFD4C2]',
      hoverShadow: 'hover:shadow-[#FFD4C2]/50',
    },
    {
      icon: <Hand className="w-5 h-5" strokeWidth={1.75} />,
      title: 'Gesture recognition',
      description: 'Navigate exercises and log reps with hand gestures alone — no controller, no touchscreen required.',
      accent: 'bg-teal-500',
      tint: 'from-teal-500 to-cyan-500',
      hoverBorder: 'hover:border-teal-200',
      hoverShadow: 'hover:shadow-teal-200/50',
    },
    {
      icon: <Monitor className="w-5 h-5" strokeWidth={1.75} />,
      title: 'Remote therapy',
      description: 'Secure video sessions with licensed therapists, backed by AI progress notes between appointments.',
      accent: 'bg-teal-600',
      tint: 'from-teal-600 to-teal-400',
      hoverBorder: 'hover:border-teal-200',
      hoverShadow: 'hover:shadow-teal-200/50',
    },
    {
      icon: <TrendingUp className="w-5 h-5" strokeWidth={1.75} />,
      title: 'Recovery tracking',
      description: 'A single dashboard charts your trajectory, surfacing milestones the moment you hit them.',
      accent: 'bg-[#FF7043]',
      tint: 'from-[#FF7043] to-rose-500',
      hoverBorder: 'hover:border-[#FFD4C2]',
      hoverShadow: 'hover:shadow-[#FFD4C2]/50',
    },
    {
      icon: <BarChart3 className="w-5 h-5" strokeWidth={1.75} />,
      title: 'Progress reports',
      description: 'Automated weekly summaries highlight what improved and what still needs attention.',
      accent: 'bg-teal-500',
      tint: 'from-teal-500 to-emerald-500',
      hoverBorder: 'hover:border-teal-200',
      hoverShadow: 'hover:shadow-teal-200/50',
    },
    {
      icon: <Dumbbell className="w-5 h-5" strokeWidth={1.75} />,
      title: 'Adaptive exercise plans',
      description: 'Your program recalibrates session to session, always tuned to the edge of your capability.',
      accent: 'bg-teal-600',
      tint: 'from-teal-600 to-cyan-500',
      hoverBorder: 'hover:border-teal-200',
      hoverShadow: 'hover:shadow-teal-200/50',
    },
  ];

  return (
    <section id="services" className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mb-16"
        >
          <span className="text-xs font-semibold text-[#D8541F] uppercase tracking-[0.14em]">What's included</span>
          <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-800 mt-3 leading-[1.1]">
            Everything recovery needs, nothing it doesn't.
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-100 rounded-2xl overflow-hidden border border-slate-100">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: (index % 3) * 0.06 }}
              className={`group relative bg-white p-8 hover:bg-slate-50/80 transition-all border-2 border-transparent ${service.hoverBorder} hover:shadow-lg ${service.hoverShadow}`}
            >
              <div className={`absolute top-0 left-0 right-0 h-[3px] ${service.accent} scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300`} />
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${service.tint} flex items-center justify-center text-white mb-6 shadow-sm group-hover:scale-110 transition-transform`}>
                {service.icon}
              </div>
              <h3 className="text-[16px] font-semibold text-slate-900 mb-2">{service.title}</h3>
              <p className="text-[14px] text-slate-500 leading-relaxed">{service.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Why Gesture Heal — compact bordered list, distinct from the Services grid
  ────────────────────────────────────────────────────────────────────────── */
const WhyGestureHeal = () => {
  const features = [
    { icon: <Monitor className="w-4 h-4" strokeWidth={1.75} />, title: 'No wearables', description: 'Just a camera', tint: 'from-teal-500 to-cyan-500' },
    { icon: <Brain className="w-4 h-4" strokeWidth={1.75} />, title: 'AI-adaptive', description: 'Adjusts in real time', tint: 'from-[#FF7043] to-[#FF8A65]' },
    { icon: <Home className="w-4 h-4" strokeWidth={1.75} />, title: 'Home-based', description: 'Recover anywhere', tint: 'from-teal-600 to-teal-400' },
    { icon: <Award className="w-4 h-4" strokeWidth={1.75} />, title: 'Doctor-approved', description: 'Clinically validated', tint: 'from-[#FF8A65] to-[#FF7043]' },
    { icon: <Cloud className="w-4 h-4" strokeWidth={1.75} />, title: 'Cloud sync', description: 'Progress, everywhere', tint: 'from-cyan-500 to-teal-500' },
    { icon: <Zap className="w-4 h-4" strokeWidth={1.75} />, title: 'Faster gains', description: 'Accelerated protocols', tint: 'from-[#FF8A65] to-[#F4511E]' },
    { icon: <Lock className="w-4 h-4" strokeWidth={1.75} />, title: 'Secure', description: 'HIPAA-compliant', tint: 'from-teal-700 to-teal-500' },
    { icon: <Users className="w-4 h-4" strokeWidth={1.75} />, title: 'Inclusive', description: 'Built for all abilities', tint: 'from-teal-400 to-teal-600' },
  ];

  return (
    <section className="py-24 lg:py-32 bg-[#F3EFE6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12 lg:gap-20 items-start">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="lg:sticky lg:top-32"
          >
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-[0.14em]">Why Gesture Heal</span>
            <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-800 mt-3 leading-[1.1]">
              Built like clinical software. Feels like coaching.
            </h2>
            <p className="text-slate-500 mt-4 leading-relaxed max-w-sm">
              Every detail — from how data is stored to how feedback is delivered — is designed around trust.
            </p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.03 }}
                className="bg-white p-5 hover:bg-slate-50 transition-colors group"
              >
                <div className={`w-8 h-8 rounded-md bg-gradient-to-br ${feature.tint} text-white flex items-center justify-center mb-3.5 shadow-sm group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="font-semibold text-[13.5px] text-slate-900 mb-0.5">{feature.title}</h3>
                <p className="text-[12.5px] text-slate-500">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Workflow — labeled sequence (numbering is meaningful here: real order)
  ────────────────────────────────────────────────────────────────────────── */
const Workflow = () => {
  const steps = [
    { icon: <User className="w-5 h-5" strokeWidth={1.75} />, title: 'Patient signs in', description: 'Start a session from any device with a camera' },
    { icon: <Camera className="w-5 h-5" strokeWidth={1.75} />, title: 'Camera calibrates', description: 'AI locates and tracks your body in frame' },
    { icon: <Brain className="w-5 h-5" strokeWidth={1.75} />, title: 'Pose is detected', description: '17-point skeletal tracking maps your form' },
    { icon: <Activity className="w-5 h-5" strokeWidth={1.75} />, title: 'Movement is scored', description: 'Each rep is evaluated against your protocol' },
    { icon: <Sparkles className="w-5 h-5" strokeWidth={1.75} />, title: 'Feedback is live', description: 'Corrections appear the moment form drifts' },
    { icon: <BarChart3 className="w-5 h-5" strokeWidth={1.75} />, title: 'Progress is logged', description: 'Every session adds to your recovery curve' },
    { icon: <Users className="w-5 h-5" strokeWidth={1.75} />, title: 'Clinician reviews', description: 'Your therapist adjusts the plan as needed' },
  ];

  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mb-16"
        >
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-[0.14em]">How it works</span>
          <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-800 mt-3 leading-[1.1]">
            One session, start to finish.
          </h2>
        </motion.div>

        <div className="relative">
          <div className="absolute left-[23px] top-2 bottom-2 w-px bg-gradient-to-b from-teal-300 via-teal-400 to-[#FFB89C]" />
          <div className="space-y-1">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.06 }}
                className="group relative flex items-start gap-6 py-5"
              >
                <div className="relative z-10 w-12 h-12 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-slate-700 flex-shrink-0 group-hover:border-teal-500 group-hover:text-teal-600 group-hover:shadow-md group-hover:shadow-teal-200/60 transition-all">
                  {step.icon}
                </div>
                <div className="pt-2.5">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-xs font-mono text-[#FF8A65] font-semibold">0{index + 1}</span>
                    <h3 className="text-[16px] font-semibold text-slate-900">{step.title}</h3>
                  </div>
                  <p className="text-[14px] text-slate-500 mt-1">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Dashboard preview — treated like a real product screenshot: browser
  chrome, sidebar, and a credible metric layout instead of placeholder tiles
  ────────────────────────────────────────────────────────────────────────── */
const DashboardPreview = () => {
  const weeklyData = [65, 72, 68, 80, 75, 88, 85];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <section id="ai-technology" className="py-24 lg:py-32 bg-[#F3EFE6] text-slate-800 relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage: 'linear-gradient(to right, rgba(13,148,136,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(13,148,136,0.08) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-teal-300/30 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-[#FF8A65]/20 rounded-full blur-3xl" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mb-14"
        >
          <span className="text-xs font-semibold text-[#D8541F] uppercase tracking-[0.14em]">The dashboard</span>
          <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-900 mt-3 leading-[1.1]">
            Your recovery, quantified.
          </h2>
          <p className="text-slate-500 mt-4 leading-relaxed">
            Every metric a therapist would track by hand, computed automatically and updated after every session.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="rounded-2xl overflow-hidden border border-teal-100 shadow-2xl shadow-teal-200/50 bg-white"
        >
          {/* browser chrome */}
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 bg-slate-50">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#FF8A65]/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-300/80" />
              <span className="w-2.5 h-2.5 rounded-full bg-teal-400/80" />
            </div>
            <div className="ml-3 px-3 py-1 rounded-md bg-slate-100 text-[11px] text-slate-500 font-mono">
              app.gestureheal.com/dashboard
            </div>
          </div>

          <div className="grid lg:grid-cols-[260px_1fr]">
            {/* sidebar */}
            <div className="hidden lg:flex flex-col gap-1 p-5 border-r border-slate-100 bg-slate-50/60">
              {[
                { icon: Gauge, label: 'Overview', active: true },
                { icon: Dumbbell, label: 'Exercises' },
                { icon: Calendar, label: 'Sessions' },
                { icon: LineChart, label: 'Reports' },
                { icon: Settings, label: 'Settings' },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium ${
                    item.active ? 'bg-gradient-to-r from-teal-100 to-[#FFE4DC] text-teal-700 border border-teal-200' : 'text-slate-500'
                  }`}
                >
                  <item.icon className="w-4 h-4" strokeWidth={1.75} />
                  {item.label}
                </div>
              ))}
            </div>

            {/* main panel */}
            <div className="p-6 sm:p-8">
              <div className="grid sm:grid-cols-[auto_1fr] gap-8 mb-8">
                <div className="flex sm:flex-col items-center sm:items-start gap-6 sm:gap-4">
                  <div className="relative w-28 h-28 flex-shrink-0">
                    <svg className="w-28 h-28 transform -rotate-90">
                      <circle className="text-slate-100" strokeWidth="6" stroke="currentColor" fill="transparent" r="50" cx="56" cy="56" />
                      <circle
                        className="text-[#FF7043]"
                        strokeWidth="6"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="50"
                        cx="56"
                        cy="56"
                        strokeDasharray={314}
                        strokeDashoffset={314 * 0.23}
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <div className="text-2xl font-bold text-slate-900">77%</div>
                      <div className="text-[10px] text-slate-500">Recovery</div>
                    </div>
                  </div>
                  <div className="text-[13px] text-slate-500">
                    <span className="text-teal-600 font-semibold">+8%</span> since last week
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Exercises', value: '24', delta: '+12', icon: Dumbbell },
                    { label: 'Sessions', value: '18', delta: '+3', icon: Calendar },
                    { label: 'Accuracy', value: '94%', delta: '+2%', icon: Target },
                    { label: 'Streak', value: '12d', delta: '🔥', icon: Flame },
                  ].map((stat, i) => (
                    <div key={i} className="bg-teal-50/50 border border-teal-100 rounded-xl p-4 hover:border-teal-300 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <stat.icon className="w-4 h-4 text-slate-400" strokeWidth={1.75} />
                        <span className="text-[10px] font-medium text-teal-600">{stat.delta}</span>
                      </div>
                      <div className="text-xl font-bold tracking-tight text-slate-900">{stat.value}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-teal-50/50 border border-teal-100 rounded-xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-5">
                  <h4 className="text-[13px] font-semibold text-slate-700">Weekly session intensity</h4>
                  <span className="text-[11px] font-medium text-teal-600">+15% vs. last week</span>
                </div>
                <div className="flex items-end justify-between h-28 gap-3">
                  {weeklyData.map((height, index) => (
                    <div key={index} className="flex-1 flex flex-col items-center gap-2">
                      <motion.div
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6, delay: index * 0.07, ease: 'easeOut' }}
                        className={`w-full rounded-md ${index === 5 ? 'bg-gradient-to-t from-[#FF7043] to-[#FF8A65]' : 'bg-gradient-to-t from-teal-500/70 to-teal-400/40'}`}
                        style={{ height: `${height}%` }}
                      />
                      <span className="text-[10px] text-slate-500">{days[index]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Conditions — colour-varied icon tiles, distinct from other card sections
  ────────────────────────────────────────────────────────────────────────── */
const Conditions = () => {
  const conditions = [
  {
    icon: '💪',
    title: 'Rotator cuff',
    desc: 'Shoulder strength & mobility',
    tint: 'bg-orange-100 text-[#C2410C]',
    hoverBorder: 'hover:border-orange-300',
    hoverShadow: 'hover:shadow-orange-200/80',
    photo: 'https://imgs.search.brave.com/4_A5NewKtboEvrdwWhE3B95jFBbvY_Os3DGbTMtwN5Y/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWcu/bGIud2JtZHN0YXRp/Yy5jb20vdmltL2xp/dmUvd2VibWQvY29u/c3VtZXJfYXNzZXRz/L3NpdGVfaW1hZ2Vz/L2FydGljbGVfdGh1/bWJuYWlscy9CaWdC/ZWFkL3JvdGF0b3Jf/Y3VmZl90ZWFyX2Jp/Z2JlYWQvMTgwMHgx/MjAwX3JvdGF0b3Jf/Y3VmZl90ZWFyX2Jp/Z2JlYWQuanBnP3Jl/c2l6ZT03NTBweDoq/Jm91dHB1dC1xdWFs/aXR5PTc1',
  },
  {
    icon: '🧠',
    title: 'Stroke rehab',
    desc: 'Motor function & coordination',
    tint: 'bg-teal-100 text-teal-700',
    hoverBorder: 'hover:border-teal-300',
    hoverShadow: 'hover:shadow-teal-200/80',
    photo: 'https://imgs.search.brave.com/KnU1th36SepyFJWcyYWflG4kiIL_ON6mkDpf_r_EToE/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9jZG4u/ZmxpbnRyZWhhYi5j/b20vdXBsb2Fkcy8y/MDIwLzAxL2V4ZXJj/aXNlcy1mb3Itc3Ry/b2tlLXBhdGllbnRz/NC5qcGc',
  },
  {
    icon: '✋',
    title: 'Hand surgery',
    desc: 'Fine motor skill recovery',
    tint: 'bg-orange-100 text-[#C2410C]',
    hoverBorder: 'hover:border-orange-300',
    hoverShadow: 'hover:shadow-orange-200/80',
    photo: 'https://imgs.search.brave.com/b2Eb8qReKOJy5SKVjwtgBizjHHeVB05eaZDWsgRfRfQ/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly93d3cu/aGFuZHN1cmdlb25u/ZWFybWUuY29tL3dw/LWNvbnRlbnQvdXBs/b2Fkcy8yMDIzLzAy/L1NjcmVlbi1TaG90/LTIwMjMtMDItMDct/YXQtMi4zNi40OS1Q/TS5wbmc',
  },
  {
    icon: '🦴',
    title: 'Fracture recovery',
    desc: 'Guided bone healing support',
    tint: 'bg-teal-100 text-teal-700',
    hoverBorder: 'hover:border-teal-300',
    hoverShadow: 'hover:shadow-teal-200/80',
    photo: 'https://imgs.search.brave.com/K57juuXknn-92axkxDZmb1BZiQe1l3eQJ4Hs2QwQNCE/rs:fit:0:180:1:0/g:ce/aHR0cHM6Ly9waHlz/aW9zdW5pdC5jb20v/d3AtY29udGVudC91/cGxvYWRzLzIwMjEv/MDQvV3Jpc3QtZmxl/eGlvbi1leHRlbnNp/b24tZXhlcmNpc2Ut/YWZ0ZXItZWxib3ct/ZnJhY3R1cmUtMTAy/NHgzMzYuanBn',
  },
  {
    icon: '⚡',
    title: 'Nerve injury',
    desc: 'Sensation & nerve function',
    tint: 'bg-orange-100 text-[#C2410C]',
    hoverBorder: 'hover:border-orange-300',
    hoverShadow: 'hover:shadow-orange-200/80',
    photo: 'https://imgs.search.brave.com/57nlx7gikHTQpvA-lK91zZv0Zw8EBj5E4Lwqgs3VpcE/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9vcnRo/b2luZm8uYWFvcy5v/cmcvY29udGVudGFz/c2V0cy8zYTEzYmUx/Y2FlNTM0MmM2OTUz/NGNlZjU5YjdiMWU2/NC9jYXJwYWwtdHVu/bmVsLXRodW1ibmFp/bC5qcGc',
  },
  {
    icon: '✋',
    title: 'Wrist rehab',
    desc: 'Strength & flexibility',
    tint: 'bg-teal-100 text-teal-700',
    hoverBorder: 'hover:border-teal-300',
    hoverShadow: 'hover:shadow-teal-200/80',
    photo: 'https://imgs.search.brave.com/VLyOoSUJwcIl_mCYN9OheDMNJHCxJFciH3aVD2QJC8s/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9tZWRp/YS5jdWgubmhzLnVr/L2ltYWdlcy9BY3Rp/aXZlX3dyaXN0X3Rl/bm9kZXNpcy53aWR0/aC04NDAucG5n',
  },
  {
    icon: '🧘',
    title: "Parkinson's",
    desc: 'Symptom & mobility management',
    tint: 'bg-orange-100 text-[#C2410C]',
    hoverBorder: 'hover:border-orange-300',
    hoverShadow: 'hover:shadow-orange-200/80',
    photo: 'https://imgs.search.brave.com/-FoszdrSb-OAaFFfW3xSbGw2rK52oB0EoFlnOtP_Iac/rs:fit:500:0:1:0/g:ce/aHR0cHM6Ly9pbWFn/ZXMuZXZlcnlkYXlo/ZWFsdGguY29tL2lt/YWdlcy8yMDI2L3Bo/eXNpY2FsLWFjdGl2/aXR5LWFkdmFuY2Vk/LXBhcmtpbnNvbnMt/c3RheS1hY3RpdmUt/MTQ0MHg4MTAuanBn',
  },
];
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-14"
        >
          <div className="max-w-xl">
            <span className="text-xs font-semibold text-teal-600 uppercase tracking-[0.14em]">Conditions</span>
            <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-800 mt-3 leading-[1.1]">
              Conditions we support</h2>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {conditions.map((condition, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.04 }}
              whileHover={{ y: -3 }}
              className={`bg-white rounded-2xl border-2 border-slate-100 shadow-sm hover:shadow-lg transition-all overflow-hidden relative ${condition.hoverBorder} ${condition.hoverShadow}`}
>
  {/* clear, fully visible photo strip */}
  <div
    className="w-full h-28 bg-cover bg-center"
    style={{ backgroundImage: `url('${condition.photo}')` }}
  />
  <div className="p-6">
    <div className={`w-11 h-11 rounded-xl ${condition.tint} flex items-center justify-center text-xl mb-4 shadow-sm -mt-11 relative z-10 ring-4 ring-white`}>
      {condition.icon}
    </div>
    <h3 className="font-semibold text-[14.5px] text-slate-900 mb-1">{condition.title}</h3>
    <p className="text-[13px] text-slate-500 leading-snug">{condition.desc}</p>
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
    if (inView) {
      let start = 0;
      const end = stat.number;
      const duration = 1600;
      const increment = end / (duration / 16);

      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 16);

      return () => clearInterval(timer);
    }
  }, [inView, stat.number]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.08 }}
      className={`text-left ${index > 0 ? 'sm:border-l sm:border-white/15 sm:pl-8' : ''}`}
    >
      <stat.icon className="w-5 h-5 text-[#FFD4C2] mb-4" strokeWidth={1.75} />
      <div className="text-4xl md:text-5xl font-bold tracking-tight">
        {count.toLocaleString()}{stat.suffix}
      </div>
      <div className="text-sm text-white/60 mt-1.5">{stat.label}</div>
    </motion.div>
  );
};

const Statistics = () => {
  const stats = [
    { number: 10000, label: 'Patients recovering', suffix: '+', icon: Users },
    { number: 97, label: 'Movement accuracy', suffix: '%', icon: Target },
    { number: 150, label: 'Partner clinics', suffix: '+', icon: AwardIcon },
    { number: 24, label: 'Monitoring availability', suffix: '/7', icon: Clock },
  ];

  return (
    <section className="py-20 lg:py-24 bg-gradient-to-r from-teal-600 via-teal-700 to-[#C1622F] relative overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 sm:gap-0 text-white">
          {stats.map((stat, index) => (
            <StatCard key={index} stat={stat} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Testimonials — one large featured quote + two compact supporting cards
  ────────────────────────────────────────────────────────────────────────── */
const Testimonials = () => {
  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'Stroke survivor',
      image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face',
      quote: 'Gesture Heal helped me regain my independence after my stroke. The AI-powered exercises made recovery feel possible and achievable.',
      featured: true,
    },
    {
      name: 'Dr. Michael Chen',
      role: 'Rehabilitation specialist',
      image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=160&h=160&fit=crop&crop=face',
      quote: 'I recommend it to every patient — the remote monitoring rivals in-person therapy.',
    },
    {
      name: 'Emily Rodriguez',
      role: 'Sports injury recovery',
      image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=160&h=160&fit=crop&crop=face',
      quote: 'Returning after my ACL injury felt impossible, until this got me back on the field stronger.',
    },
  ];

  return (
    <section id="testimonials" className="py-24 lg:py-32 bg-[#F3EFE6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-xl mb-14"
        >
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-[0.14em]">In their words</span>
          <h2 className="text-3xl md:text-[2.75rem] font-bold tracking-tight text-slate-900 mt-3 leading-[1.1]">
            Recovery, told first-hand.
          </h2>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative bg-gradient-to-br from-teal-600 via-teal-800 to-[#C2410C] text-white rounded-3xl overflow-hidden grid sm:grid-cols-[140px_1fr] shadow-lg shadow-teal-900/20"
          >
            {/* portrait photo column */}
            <div
              className="hidden sm:block bg-cover bg-center min-h-[280px]"
              style={{
                backgroundImage: `url('${testimonials[0].image.replace('w=200&h=200', 'w=400&h=600')}')`,
              }}
            />
            <div className="p-10 flex flex-col justify-between">
              <Quote className="w-9 h-9 text-[#FFD4C2]/50 mb-6" />
              <p className="text-xl sm:text-2xl leading-snug font-medium mb-10">
                "{testimonials[0].quote}"
              </p>
              <div className="flex items-center gap-3.5">
                <img src={testimonials[0].image} alt={testimonials[0].name} className="w-11 h-11 rounded-full object-cover sm:hidden" />
                <div>
                  <div className="font-semibold text-[14px]">{testimonials[0].name}</div>
                  <div className="text-[12.5px] text-white/70">{testimonials[0].role}</div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="grid sm:grid-cols-1 gap-6">
            {testimonials.slice(1).map((t, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="bg-white rounded-2xl p-7 border border-teal-100 shadow-sm hover:shadow-md hover:shadow-teal-100/60 transition-shadow flex-1"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-[#FF7043] text-[#FF7043]" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed text-[14.5px] mb-6">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <img src={t.image} alt={t.name} className="w-9 h-9 rounded-full object-cover ring-2 ring-teal-100" />
                  <div>
                    <div className="font-semibold text-[13px] text-slate-900">{t.name}</div>
                    <div className="text-[12px] text-slate-500">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
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
    {
      q: 'How does Gesture Heal work?',
      a: "Gesture Heal uses AI and computer vision to analyze your movements through your device's camera. The system provides real-time feedback and personalized exercise programs to help you recover effectively from the comfort of your home.",
    },
    {
      q: 'Is my data secure and private?',
      a: 'Yes, Gesture Heal is fully HIPAA compliant. All your health data is encrypted and stored securely. We never share your information with third parties without your explicit consent.',
    },
    {
      q: 'Do I need any special equipment?',
      a: 'No, you only need a device with a camera (smartphone, tablet, or computer) and an internet connection. Our AI technology works with standard cameras to track your movements.',
    },
    {
      q: 'What conditions can Gesture Heal help with?',
      a: "Gesture Heal supports rehabilitation for stroke, knee injuries, shoulder rehabilitation, hand therapy, post-surgery recovery, Parkinson's disease.",
    },
    {
      q: 'How is this different from traditional physical therapy?',
      a: 'Gesture Heal combines the convenience of remote therapy with AI-powered analysis and real-time feedback. You get the benefits of professional guidance with the flexibility of home-based rehabilitation.',
    },
    {
      q: 'Can I use Gesture Heal alongside my regular therapy?',
      a: 'Yes, Gesture Heal is designed to complement traditional therapy. Many patients use it between appointments to maintain consistency and track their progress.',
    },
  ];

  // solid downward triangle, matching the reference art rather than an outline chevron
  const Triangle = ({ open }) => (
    <motion.svg
      width="14"
      height="9"
      viewBox="0 0 14 9"
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.25 }}
      className="flex-shrink-0"
    >
      <path d="M0 0 L14 0 L7 9 Z" fill={open ? '#0d9488' : '#94a3b8'} />
    </motion.svg>
  );

  return (
    <section id="faq" className="py-24 lg:py-32 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <span className="text-xs font-semibold text-teal-600 uppercase tracking-[0.14em]">Questions</span>
          <h2 className="font-serif text-4xl md:text-5xl font-bold text-slate-900 mt-3">
            Frequently Asked Questions
          </h2>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: index * 0.03 }}
                className="bg-[#F3EFE6] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_20px_rgba(0,0,0,0.04)] overflow-hidden"
              >
                <button
                  className="w-full px-7 py-5 flex items-center justify-between gap-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  <span className="font-serif font-bold text-[17px] text-slate-900">
                    {faq.q}
                  </span>
                  <Triangle open={isOpen} />
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <p className="px-7 pb-6 text-slate-600 leading-relaxed text-[15px]">
                        {faq.a}
                      </p>
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
const CTA = ({ setShowRoleModal }) => {
  return (
    <section id="contact" className="py-24 lg:py-32 bg-[#FAF8F3]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-[2rem] bg-gradient-to-br from-teal-800 via-teal-900 to-[#C2410C] px-8 py-16 sm:px-16 sm:py-20 overflow-hidden shadow-xl shadow-teal-900/20"
        >
          {/* background photo, heavily darkened, reinforces "movement is being watched" */}
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage:
                "url('https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1600&q=80&fit=crop')",
              filter: 'saturate(1.1)',
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(110deg, rgba(13,148,136,0.88) 0%, rgba(20,120,110,0.85) 45%, rgba(244,81,30,0.55) 75%, rgba(255,138,101,0.35) 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: 'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
          <div className="relative max-w-2xl">
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-white leading-[1.08] mb-5">
              Ready to begin?
            </h2>
            <p className="text-lg text-white/70 mb-10 max-w-md leading-relaxed">
              A free assessment takes five minutes and gives you a personalized recovery plan the same day.
            </p>
            <div className="flex flex-wrap gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowRoleModal(true)}
                className="px-7 py-3.5 text-[15px] font-semibold bg-white text-slate-900 rounded-full shadow-lg shadow-black/20 hover:shadow-xl transition-all flex items-center gap-2"
              >
                Start free assessment
                <ArrowUpRight className="w-4 h-4 text-[#FF7043]" />
              </motion.button>
              <button className="px-7 py-3.5 text-[15px] font-semibold text-white border border-white/30 rounded-full hover:bg-white/10 transition-all">
                Book a consultation
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
  Footer
  ────────────────────────────────────────────────────────────────────────── */


const Footer = () => {
  return (
    <footer
      className="relative overflow-hidden border-t-2 border-teal-500/30"
      style={{
        backgroundImage:
        "linear-gradient(rgba(13,58,53,0.92), rgba(13,58,53,0.92)), url('https://images.unsplash.com/photo-1584982751601-97dcc096659c?w=1600&q=80&fit=crop')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12">
        <div className="flex flex-col items-center text-center">
          {/* Logo */}
          <a
            href="/"
            className="flex items-center gap-3 mb-6 hover:opacity-90 transition"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-[#FF7043] flex items-center justify-center shadow-md">
              <Activity className="w-5 h-5 text-white" />
            </div>

            <span className="text-3xl font-extrabold text-white">
              Gesture Heal
            </span>
          </a>

          {/* Description */}
          <p className="max-w-2xl text-lg leading-8 text-white/70 font-semibold">
            AI-powered rehabilitation platform that empowers patients with
            intelligent gesture recognition, personalized therapy, and seamless
            progress tracking for faster recovery.
          </p>

          {/* Bottom */}
          <div className="w-full border-t border-white/15 mt-10 pt-6">
            <p className="text-base font-semibold text-white">
              © 2026 Gesture Heal. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};
export default HomePage;