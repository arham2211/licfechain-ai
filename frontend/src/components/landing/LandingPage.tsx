"use client";

import { useEffect, useState } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Brain,
  CheckCircle,
  ChevronRight,
  Database,
  Fingerprint,
  GitBranch,
  Globe,
  Heart,
  Lock,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Play,
  Send,
  Sparkles,
  Star,
  X,
  Zap,
} from "lucide-react";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
});

interface Feature {
  icon: React.ReactElement<React.SVGProps<SVGSVGElement>>;
  color: string;
  title: string;
  description: string;
  delay: number;
}

const navItems = ["Home", "Features", "About", "Testimonial", "Contact"];

const features: Feature[] = [
  {
    icon: <Fingerprint className="h-8 w-8" />,
    title: "Unique Patient ID",
    description:
      "Universal identifier linking all medical records from birth throughout life securely.",
    color: "bg-blue-50 text-blue-600",
    delay: 0,
  },
  {
    icon: <Brain className="h-8 w-8" />,
    title: "AI Extraction",
    description:
      "Advanced OCR & NLP models instantly extract structured data from messy medical reports.",
    color: "bg-purple-50 text-purple-600",
    delay: 0.1,
  },
  {
    icon: <GitBranch className="h-8 w-8" />,
    title: "Family Genetics",
    description:
      "Identify hereditary risks through automated, comprehensive family tree analysis.",
    color: "bg-emerald-50 text-emerald-600",
    delay: 0.2,
  },
  {
    icon: <Globe className="h-8 w-8" />,
    title: "Global Access",
    description:
      "Travel with confidence. Access records worldwide with real-time medical translation.",
    color: "bg-orange-50 text-orange-600",
    delay: 0.3,
  },
  {
    icon: <Activity className="h-8 w-8" />,
    title: "Vitals Monitoring",
    description:
      "AI-powered tracking for chronic conditions with predictive health insights.",
    color: "bg-rose-50 text-rose-600",
    delay: 0.4,
  },
  {
    icon: <Heart className="h-8 w-8" />,
    title: "Dental AI",
    description:
      "Early detection deep learning models for dental diseases from standard imaging.",
    color: "bg-indigo-50 text-indigo-600",
    delay: 0.5,
  },
];

const testimonials = [
  {
    quote:
      "LifeChain AI saved my life during an emergency abroad. Doctors accessed my complete medical history instantly despite the language barrier.",
    name: "Maria Johnson",
    role: "Diabetes Patient",
    initials: "MJ",
    gradient: "from-blue-500 to-cyan-400",
  },
  {
    quote:
      "The family tree analysis revealed hereditary heart conditions we never knew about. Early detection made all the difference for my children.",
    name: "Robert Chen",
    role: "Parent",
    initials: "RC",
    gradient: "from-purple-500 to-pink-400",
  },
  {
    quote:
      "Finally, a system that makes sense. No more carrying stacks of paper reports. Everything is digitized, secure, and always with me.",
    name: "Sarah Ahmed",
    role: "Frequent Traveler",
    initials: "SA",
    gradient: "from-emerald-500 to-teal-400",
  },
];

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const router = useRouter();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId.toLowerCase());
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: "smooth",
      });
    }
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const hash = window.location.hash;
    if (hash) {
      const sectionId = hash.substring(1);
      setTimeout(() => {
        scrollToSection(sectionId);
      }, 100);
    }
  }, []);

  return (
    <div
      className={`${plusJakartaSans.className} landing-theme min-h-screen overflow-hidden bg-gradient-to-br from-gray-50 to-white`}
    >
      <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-1 sm:px-6 lg:px-8">
          <div className="flex h-20 items-center justify-between">
            <div className="group flex cursor-pointer items-center space-x-3">
              <div className="relative">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 opacity-70 blur transition-opacity group-hover:opacity-100" />
                <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-lg">
                  <Activity className="h-6 w-6 text-primary-600" />
                </div>
              </div>
              <div>
                <h1 className="gradient-text bg-clip-text text-2xl font-bold text-transparent">
                  LifeChain AI
                </h1>
                <p className="text-xs font-medium text-gray-500">
                  Healthcare Ecosystem
                </p>
              </div>
            </div>

            <div className="hidden items-center space-x-1 lg:flex">
              {navItems.map((item) => (
                <button
                  key={item}
                  onClick={() => scrollToSection(item.toLowerCase())}
                  className="cursor-pointer rounded-full px-4 py-2 font-semibold text-slate-600 transition-all duration-200 hover:bg-primary-50 hover:text-primary-600"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="hidden items-center space-x-4 lg:flex">
              <button
                onClick={() => router.push("/sign-in")}
                className="group relative cursor-pointer overflow-hidden rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-300 hover:shadow-lg hover:shadow-primary-500/30"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-secondary-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="relative flex items-center space-x-2">
                  <span>Get Started</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="rounded-lg p-2.5 transition-colors hover:bg-gray-100 lg:hidden"
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 text-gray-700" />
              ) : (
                <Menu className="h-6 w-6 text-gray-700" />
              )}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-gray-100 bg-white/80 shadow-2xl backdrop-blur-xl lg:hidden">
            <div className="space-y-2 px-4 py-6">
              {navItems.map((item) => (
                <button
                  key={item}
                  onClick={() => scrollToSection(item.toLowerCase())}
                  className="group relative w-full overflow-hidden rounded-xl px-4 py-3 text-left font-semibold text-slate-700 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-secondary-500/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative z-10 transition-colors group-hover:text-primary-600">
                    {item}
                  </span>
                </button>
              ))}

              <div className="my-4 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent" />

              <div className="px-1 pt-2">
                <button
                  onClick={() => router.push("/sign-in")}
                  className="group relative w-full overflow-hidden rounded-xl bg-slate-900 px-6 py-3 font-semibold text-white shadow-lg transition-all duration-300 hover:shadow-primary-500/30"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-secondary-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative flex items-center justify-center gap-2">
                    <span>Get Started</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <section
        id="home"
        className="relative overflow-hidden pb-20 pt-32 lg:pb-32 lg:pt-48"
      >
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="animation-delay-0 absolute top-0 left-1/2 h-[500px] w-[1000px] -translate-x-1/2 animate-blob rounded-full bg-gradient-to-r from-primary-200/40 to-secondary-200/40 opacity-70 blur-[100px]" />
          <div className="animation-delay-2000 absolute right-0 bottom-0 h-[600px] w-[800px] animate-blob rounded-full bg-gradient-to-l from-purple-200/30 to-blue-200/30 opacity-50 blur-[100px]" />
          <div className="animation-delay-4000 absolute top-1/2 left-0 h-[600px] w-[600px] animate-blob rounded-full bg-gradient-to-tr from-emerald-200/30 to-teal-200/30 opacity-40 blur-[100px]" />
          <div className="bg-grid-pattern absolute inset-0 opacity-[0.03]" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2 lg:gap-8">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="space-y-8 text-center lg:text-left"
            >
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-flex items-center space-x-2.5 rounded-full border border-primary-100 bg-white/60 px-4 py-2 shadow-sm backdrop-blur-md"
              >
                <div className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary-500" />
                </div>
                <span className="bg-gradient-to-r from-primary-700 to-primary-500 bg-clip-text text-sm font-semibold text-transparent">
                  Revolutionizing Patient Care
                </span>
              </motion.div>

              <h1 className="text-5xl leading-[1.1] font-bold tracking-tight text-slate-900 lg:text-7xl">
                Your Lifelong
                <span className="animate-gradient mt-2 block bg-[length:200%_auto] bg-gradient-to-r from-primary-600 via-secondary-500 to-primary-600 bg-clip-text text-transparent">
                  Health Companion
                </span>
              </h1>

              <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 lg:mx-0">
                Unified medical records, AI-powered diagnostics, and genetic
                insights in one secure ecosystem. From birth to beyond,
                LifeChain AI travels with you.
              </p>

              <div className="flex flex-col justify-center gap-4 pt-4 sm:flex-row lg:justify-start">
                <button
                  onClick={() => router.push("/sign-in")}
                  className="group relative overflow-hidden rounded-2xl bg-slate-900 px-8 py-4 font-semibold text-white ring-1 ring-slate-900 transition-all duration-300 hover:shadow-2xl hover:shadow-primary-500/20"
                >
                  <div className="absolute inset-0 translate-x-[-100%] bg-gradient-to-r from-primary-600 to-secondary-500 transition-transform duration-500 group-hover:translate-x-0" />
                  <span className="relative flex items-center justify-center space-x-3">
                    <span>Start Your Journey</span>
                    <ChevronRight className="h-5 w-5" />
                  </span>
                </button>

                <button className="group flex items-center justify-center space-x-3 rounded-2xl border border-white bg-white/50 px-8 py-4 font-semibold text-slate-700 shadow-sm backdrop-blur-sm transition-all duration-300 hover:border-primary-200 hover:bg-white hover:shadow-xl hover:shadow-primary-500/10">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 transition-transform group-hover:scale-110">
                    <Play className="h-3.5 w-3.5 fill-current text-primary-600" />
                  </div>
                  <span>Watch Demo</span>
                </button>
              </div>

              <div className="flex items-center justify-center space-x-6 pt-8 text-sm font-medium text-slate-500 lg:justify-start">
                <div className="-space-x-3 flex">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-10 w-10 overflow-hidden rounded-full border-2 border-white bg-slate-200"
                    >
                      <img
                        src={`https://picsum.photos/100/100?random=${i}`}
                        alt="User"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-primary-50 text-xs text-primary-700">
                    +2k
                  </div>
                </div>
                <p>Trusted by doctors & patients.</p>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative flex items-center justify-center lg:h-[600px]"
            >
              <motion.div
                animate={{ y: [-10, 10, -10] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute top-10 right-10 z-20 lg:right-0"
              >
                <div className="glass-card max-w-[200px] rounded-2xl p-4 shadow-xl shadow-primary-500/10">
                  <div className="flex items-center space-x-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-400 shadow-md">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">
                        AI Analysis
                      </h4>
                      <p className="text-xs text-slate-500">
                        Processing vitals...
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full w-[70%] rounded-full bg-gradient-to-r from-primary-500 to-secondary-400" />
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [15, -15, 15] }}
                transition={{
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1,
                }}
                className="absolute bottom-20 left-4 z-20 lg:-left-12"
              >
                <div className="glass-card flex items-center space-x-4 rounded-2xl p-4 shadow-xl shadow-secondary-500/10">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-secondary-500 to-primary-400 shadow-lg">
                    <Lock className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">HIPAA Secure</h4>
                    <p className="mt-0.5 flex items-center text-xs font-semibold text-green-600">
                      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-green-500" />
                      Verified Protection
                    </p>
                  </div>
                </div>
              </motion.div>

              <div className="relative aspect-square w-full max-w-[500px]">
                <div className="absolute inset-0 rotate-12 rounded-full bg-gradient-to-br from-primary-500/20 to-secondary-500/20 blur-3xl" />
                <div className="relative h-full w-full overflow-hidden rounded-[3rem] border border-slate-100 bg-white shadow-2xl shadow-primary-900/10">
                  <div className="absolute top-0 h-full w-full bg-[url('https://picsum.photos/800/800?grayscale')] bg-cover opacity-5" />
                  <div className="relative flex h-full flex-col items-center justify-center space-y-8 p-8 text-center">
                    <div className="flex h-32 w-32 rotate-3 items-center justify-center rounded-3xl bg-gradient-to-tr from-primary-600 to-secondary-500 shadow-2xl shadow-primary-500/30 transition-transform duration-500 hover:rotate-6">
                      <Activity className="h-16 w-16 text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-bold text-slate-900">
                        LifeChain AI
                      </h2>
                      <p className="mt-2 font-medium text-slate-500">
                        Universal Health Identity
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      <span className="h-1.5 w-8 rounded-full bg-primary-500" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="features" className="bg-slate-50/50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-20 max-w-3xl text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-6 inline-flex items-center space-x-2 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm"
            >
              <Sparkles className="h-4 w-4 text-amber-500" />
              <span className="text-xs font-bold tracking-wide text-slate-800 uppercase">
                Capabilities
              </span>
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="mb-6 text-4xl font-bold text-slate-900 lg:text-5xl"
            >
              Unified Healthcare
              <span className="block bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent">
                Ecosystem Features
              </span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-lg text-slate-600"
            >
              Connecting disparate medical data into one intelligent, secure,
              and accessible platform.
            </motion.p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: feature.delay, duration: 0.5 }}
                className="group relative overflow-hidden rounded-3xl border border-slate-100 bg-white p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-primary-900/5"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 transition-all duration-500 group-hover:scale-110 group-hover:opacity-10">
                  {feature.icon}
                </div>

                <div
                  className={`relative mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ${feature.color} shadow-sm transition-transform duration-300 group-hover:scale-110`}
                >
                  {feature.icon}
                </div>

                <h3 className="mb-3 text-xl font-bold text-slate-900 transition-colors group-hover:text-primary-600">
                  {feature.title}
                </h3>

                <p className="mb-6 leading-relaxed text-slate-500">
                  {feature.description}
                </p>

                <div className="flex cursor-pointer items-center text-sm font-semibold text-slate-900 transition-colors group-hover:text-primary-600">
                  <span>Learn more</span>
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="relative overflow-hidden bg-white py-24">
        <div className="absolute top-0 right-0 -z-10 h-full w-1/3 bg-gradient-to-l from-slate-50 to-transparent" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-20 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="relative"
            >
              <div className="absolute -inset-4 rotate-3 rounded-[2.5rem] bg-gradient-to-tr from-primary-500 to-secondary-400 opacity-20 blur-2xl" />
              <div className="relative rounded-[2rem] border border-slate-100 bg-white p-2 shadow-2xl">
                <img
                  src="https://picsum.photos/800/600?medical"
                  alt="Medical Doctor using Tablet"
                  className="h-[400px] w-full rounded-[1.8rem] object-cover"
                />

                <div className="animate-float-delayed absolute -right-10 -bottom-10 hidden max-w-xs rounded-2xl border border-slate-50 bg-white p-6 shadow-xl md:block">
                  <div className="flex items-center gap-4">
                    <div className="rounded-xl bg-green-100 p-3">
                      <Database className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Data Points Processed
                      </p>
                      <h4 className="text-2xl font-bold text-slate-900">
                        1.2M+
                      </h4>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
            >
              <div className="mb-6 inline-flex items-center space-x-2 rounded-full bg-primary-50 px-3 py-1 text-primary-600">
                <Activity className="h-4 w-4" />
                <span className="text-xs font-bold tracking-wide uppercase">
                  Our Vision
                </span>
              </div>

              <h2 className="mb-6 text-4xl leading-tight font-bold text-slate-900">
                Redefining Healthcare <br />
                <span className="bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent">
                  Through Innovation
                </span>
              </h2>

              <p className="mb-8 text-lg leading-relaxed text-slate-600">
                In today&apos;s fragmented healthcare landscape, critical
                medical information remains siloed. LifeChain AI bridges these
                gaps, creating a seamless, intelligent ecosystem.
              </p>

              <div className="space-y-4">
                {[
                  "Consolidated lifelong medical records",
                  "Real-time AI translation for global access",
                  "Hereditary risk identification",
                  "Predictive health monitoring insights",
                ].map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center space-x-3"
                  >
                    <CheckCircle className="h-5 w-5 shrink-0 text-primary-500" />
                    <span className="font-medium text-slate-700">{item}</span>
                  </motion.div>
                ))}
              </div>

              <div className="mt-10 border-t border-slate-100 pt-8">
                <div className="flex items-center space-x-4">
                  <div className="h-12 w-1 rounded-full border-l-4 border-primary-500" />
                  <div>
                    <p className="text-sm font-semibold tracking-widest text-slate-500 uppercase">
                      Supervised By
                    </p>
                    <p className="text-lg font-bold text-slate-900">
                      Dr. Shahbaz Siddiqui
                    </p>
                    <p className="text-sm text-slate-500">
                      Department of Computer Science
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="testimonial" className="relative bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-4xl font-bold text-slate-900">
              Trusted by Patients
            </h2>
            <p className="text-lg text-slate-600">
              Real stories from people whose lives have been transformed by our
              unified ecosystem.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.2 }}
                className="flex h-full flex-col rounded-3xl border border-slate-100 bg-white p-8 shadow-lg shadow-slate-200/50"
              >
                <div className="mb-6 flex gap-1">
                  {[...Array(5)].map((_, starIndex) => (
                    <Star
                      key={starIndex}
                      className="h-4 w-4 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>

                <blockquote className="mb-8 flex-grow leading-relaxed italic text-slate-700">
                  &quot;{testimonial.quote}&quot;
                </blockquote>

                <div className="mt-auto flex items-center gap-4 border-t border-slate-50 pt-6">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${testimonial.gradient} text-lg font-bold text-white shadow-md`}
                  >
                    {testimonial.initials}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">
                      {testimonial.name}
                    </div>
                    <div className="text-sm text-slate-500">
                      {testimonial.role}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section id="contact" className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-16 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <div className="mb-6 inline-flex items-center space-x-2 rounded-full bg-blue-50 px-3 py-1 text-primary-600">
                <MessageSquare className="h-4 w-4" />
                <span className="text-xs font-bold tracking-wide uppercase">
                  Get in Touch
                </span>
              </div>

              <h2 className="mb-6 text-4xl leading-tight font-bold text-slate-900">
                Let&apos;s Transform{" "}
                <span className="bg-gradient-to-r from-primary-600 to-secondary-500 bg-clip-text text-transparent">
                  Healthcare Together
                </span>
              </h2>

              <p className="mb-12 text-lg text-slate-600">
                Whether you&apos;re a healthcare provider, researcher, or
                patient, we&apos;re here to answer your questions.
              </p>

              <div className="space-y-8">
                <div className="flex items-start space-x-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
                    <MapPin className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900">
                      Visit Us
                    </h4>
                    <p className="text-slate-600">
                      FAST National University
                      <br />
                      Karachi, Pakistan
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary-100 text-secondary-600">
                    <Mail className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-slate-900">
                      Email Us
                    </h4>
                    <p className="text-slate-600">research@lifechainai.com</p>
                    <p className="text-slate-600">support@lifechainai.com</p>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-slate-100 bg-slate-50 p-8 shadow-lg lg:p-10"
            >
              <form className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      First Name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                      placeholder="John"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">
                      Last Name
                    </label>
                    <input
                      type="text"
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="john@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">
                    Message
                  </label>
                  <textarea
                    rows={4}
                    className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-200"
                    placeholder="How can we help you?"
                  />
                </div>

                <button className="flex w-full items-center justify-center space-x-2 rounded-xl bg-slate-900 py-4 font-bold text-white transition-colors hover:bg-slate-800">
                  <span>Send Message</span>
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </motion.div>
          </div>
        </div>
      </section>

      <footer className="bg-slate-900 pt-20 pb-10 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="mb-6 flex items-center space-x-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 text-white">
                  <Activity className="h-6 w-6" />
                </div>
                <div>
                  <span className="text-2xl font-bold text-white">
                    LifeChain AI
                  </span>
                  <p className="text-xs text-slate-400">
                    Healthcare Ecosystem
                  </p>
                </div>
              </div>
              <p className="leading-relaxed text-slate-400">
                Unifying global healthcare through intelligent, secure medical
                record management and predictive analytics.
              </p>
            </div>

            <div>
              <h3 className="mb-6 text-lg font-semibold text-white">
                Quick Links
              </h3>
              <ul className="space-y-3">
                {navItems.map((item) => (
                  <li key={item}>
                    <button
                      onClick={() => scrollToSection(item.toLowerCase())}
                      className="cursor-pointer text-gray-400 transition-colors duration-200 hover:text-primary-400"
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-6 text-lg font-semibold text-white">
                Resources
              </h3>
              <ul className="space-y-3">
                {[
                  "Documentation",
                  "Privacy Policy",
                  "Terms of Service",
                  "FAQ",
                ].map((item) => (
                  <li key={item}>
                    <a className="cursor-pointer text-slate-400 transition-colors duration-200 hover:text-cyan-400">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="mb-6 text-lg font-semibold text-white">
                Stay Updated
              </h3>
              <p className="mb-4 leading-relaxed text-slate-400">
                Subscribe for project updates and healthcare insights.
              </p>
              <div className="group flex">
                <input
                  type="email"
                  placeholder="Your email"
                  className="flex-1 rounded-l-xl border border-gray-700 bg-slate-800 px-4 py-3 text-white focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                />
                <button className="rounded-r-xl bg-gradient-to-r from-primary-600 to-secondary-500 px-6 transition-shadow duration-300 hover:shadow-lg">
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-800 pt-8 text-center">
            <p className="text-gray-400">
              © {new Date().getFullYear()} LifeChain AI. Final Year Project —
              FAST National University.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
