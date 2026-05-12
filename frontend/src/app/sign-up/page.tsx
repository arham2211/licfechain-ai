"use client";

import Link from "next/link";
import { ArrowLeft, CheckCircle2, FileCheck, Microscope, ShieldCheck, Sparkles, Stethoscope, UserRound } from "lucide-react";

type VerificationGroup = {
  title: string;
  intro: string;
  requirements: string[];
};

const verificationGroups: VerificationGroup[] = [
  {
    title: "Patients",
    intro:
      "For patient accounts, we verify identity first so records stay attached to the right person from day one.",
    requirements: [
      "Full name",
      "CNIC, or B-Form for minors",
      "Birth certificate when CNIC is not available",
      "Date of birth",
      "Gender",
      "Blood group",
      "Phone number",
      "Email address if available",
      "Home address if available",
    ],
  },
  {
    title: "Doctors",
    intro:
      "For doctors, we verify both identity and professional credentials before access is approved.",
    requirements: [
      "Full name",
      "CNIC",
      "Date of birth",
      "Gender",
      "Blood group",
      "Phone number",
      "Email address if available",
      "Address if available",
      "Medical specialization",
      "License number",
      "Hospital affiliation if available",
    ],
  },
  {
    title: "Labs",
    intro:
      "For laboratory accounts, we verify the organization details and the contact information needed for secure report handling.",
    requirements: [
      "Lab name",
      "Lab location",
      "Accreditation number if available",
      "Phone number",
      "Official email address",
    ],
  },
];

export default function SignUpPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-20 bg-gradient-to-br from-slate-50 via-white to-blue-50/60" />
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-[-8%] left-[-8%] h-[320px] w-[320px] rounded-full bg-primary-200/30 blur-[100px]" />
        <div className="absolute top-[18%] right-[-10%] h-[360px] w-[360px] rounded-full bg-cyan-200/30 blur-[120px]" />
        <div className="absolute bottom-[-12%] left-[18%] h-[380px] w-[380px] rounded-full bg-emerald-200/20 blur-[140px]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm backdrop-blur-sm transition hover:text-primary-600 hover:shadow-md"
          >
            <ArrowLeft size={16} />
            Back to Sign In
          </Link>
          <div className="hidden rounded-full border border-primary-100 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary-700 shadow-sm backdrop-blur-md sm:inline-flex">
            Verified Onboarding
          </div>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-white/70 bg-white/82 shadow-[0_35px_100px_rgba(14,165,233,0.16)] backdrop-blur-2xl">
          <div className="h-1 bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400" />
          <div className="grid gap-8 px-6 py-8 sm:px-8 sm:py-10 lg:grid-cols-[1.35fr_0.9fr] lg:items-start">
            <div className="space-y-6">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary-100 bg-white/75 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-700 shadow-sm backdrop-blur-sm">
                  <Sparkles size={14} />
                  Create Account
                </span>
                <h1 className="max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
                  <span className="bg-gradient-to-r from-slate-900 via-primary-700 to-cyan-500 bg-clip-text text-transparent">
                    A safer way to join LifeChain AI starts with verification.
                  </span>
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  LifeChain AI is built for trusted healthcare access, not open-signup noise. People choose us because we keep
                  patient records structured, connect doctors, labs, and families in one place, and make reports easier to trace,
                  review, and understand.
                </p>
                <p className="max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
                  What makes us different is that every account is checked before activation, so the platform stays accurate,
                  secure, and dependable for real medical use. Instead of filling out a signup form, please email our admin at{" "}
                  <a className="font-semibold text-primary-700 underline decoration-primary-300 underline-offset-4" href="mailto:arhamaffan22@gmail.com">
                    arhamaffan22@gmail.com
                  </a>{" "}
                  with your role and the verification details below.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-3xl border border-white/80 bg-gradient-to-br from-white to-sky-50 p-5 shadow-[0_18px_45px_rgba(14,165,233,0.08)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-cyan-400 text-white shadow-lg shadow-primary-500/20">
                    <ShieldCheck size={20} />
                  </div>
                  <h2 className="mt-4 text-sm font-semibold text-slate-900">Why people choose us</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    One trusted platform for records, visits, lab reports, and long-term health history.
                  </p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-gradient-to-br from-white to-cyan-50 p-5 shadow-[0_18px_45px_rgba(34,211,238,0.08)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-400 text-white shadow-lg shadow-cyan-500/20">
                    <FileCheck size={20} />
                  </div>
                  <h2 className="mt-4 text-sm font-semibold text-slate-900">Our features</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Patient timelines, lab report management, doctor workflows, and connected family health context.
                  </p>
                </div>
                <div className="rounded-3xl border border-white/80 bg-gradient-to-br from-white to-emerald-50 p-5 shadow-[0_18px_45px_rgba(16,185,129,0.08)]">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-cyan-400 text-white shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 size={20} />
                  </div>
                  <h2 className="mt-4 text-sm font-semibold text-slate-900">What makes us unique</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Manual verification keeps identities, credentials, and medical data trustworthy from the start.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-slate-900 via-slate-800 to-primary-900 p-6 text-white shadow-[0_25px_80px_rgba(15,23,42,0.24)]">
              <div className="absolute top-0 right-0 h-36 w-36 rounded-full bg-cyan-400/20 blur-3xl" />
              <div className="absolute bottom-0 left-0 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl" />
              <div className="relative">
                <div className="inline-flex rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100">
                  Access Flow
                </div>
                <h2 className="mt-4 text-2xl font-semibold">Verified onboarding, created by admin.</h2>
                <p className="mt-3 text-sm leading-7 text-slate-300">
                  After we check that everything is valid, the admin team creates the account and shares the credentials with you.
                </p>

                <div className="mt-6 space-y-3">
                  {[
                    "Email your role and required details",
                    "Admin reviews your identity or organization data",
                    "We create the account after successful verification",
                  ].map((step, index) => (
                    <div key={step} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-sm font-semibold text-cyan-100">
                        {index + 1}
                      </div>
                      <p className="text-sm leading-6 text-slate-200">{step}</p>
                    </div>
                  ))}
                </div>

                <a
                  href="mailto:arhamaffan22@gmail.com?subject=LifeChain%20AI%20Account%20Request"
                  className="mt-6 inline-flex items-center rounded-2xl bg-white px-5 py-3 text-sm font-semibold !text-slate-900 transition hover:bg-slate-100"
                >
                  Email Admin to Start
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          {verificationGroups.map((group) => (
            <article
              key={group.title}
              className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-lg ${
                  group.title === "Patients"
                    ? "bg-gradient-to-br from-primary-500 to-cyan-400 shadow-primary-500/20"
                    : group.title === "Doctors"
                      ? "bg-gradient-to-br from-cyan-500 to-sky-400 shadow-cyan-500/20"
                      : "bg-gradient-to-br from-emerald-500 to-cyan-400 shadow-emerald-500/20"
                }`}>
                  {group.title === "Patients" ? <UserRound size={20} /> : group.title === "Doctors" ? <Stethoscope size={20} /> : <Microscope size={20} />}
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Verification</div>
                  <h2 className="text-xl font-semibold text-slate-950">{group.title}</h2>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">{group.intro}</p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
                {group.requirements.map((item) => (
                  <li key={item} className="flex gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 leading-6">
                    <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-primary-500 to-cyan-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className="relative overflow-hidden rounded-[28px] border border-white/70 bg-white/85 px-6 py-6 shadow-[0_30px_80px_rgba(2,132,199,0.12)] backdrop-blur-2xl sm:px-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-cyan-400 to-emerald-400" />
          <h2 className="pt-2 text-xl font-semibold text-slate-950">How to request access</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
            In your email, mention whether you are applying as a patient, doctor, or lab. Attach the matching information above,
            and include anything that helps us verify your identity or organization faster. After review, the admin team will
            create the account and share the login credentials with you.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="mailto:arhamaffan22@gmail.com?subject=LifeChain%20AI%20Account%20Request"
              className="inline-flex items-center rounded-full bg-gradient-to-r from-primary-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:shadow-xl"
            >
              Email Admin
            </a>
            <Link
              href="/sign-in"
              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-primary-200 hover:text-primary-700"
            >
              Back to Sign In
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
