import React, { useMemo, useState, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { AssessmentRecord, PotentialResult } from '../lib/api';

export interface MuscleInfo {
  id: string;
  name: string;
  locationName: string;
  exercise: string;
  exerciseType: 'jump' | 'pushup' | 'squat';
  status: 'optimal' | 'needs_focus' | 'fatigued';
  score: number;
  pos3D: [number, number, number]; // 3D coordinates in scene
  whereToImprove: string;
  howToImprove: string;
  recommendedDrills: string[];
}

export interface HumanModel3DProps {
  assessments?: AssessmentRecord[];
  potential?: PotentialResult | null;
  selectedExercise?: 'jump' | 'pushup' | 'squat';
  onSelectExercise?: (exercise: 'jump' | 'pushup' | 'squat') => void;
  onSelectMuscle?: (m: MuscleInfo) => void;
}

/**
 * Solid 3D Athletic Human Leg & Musculoskeletal Anatomy Model.
 * Renders a solid, realistic, proportioned 3D human body with studio lighting
 * and interactive muscle group highlighting (no transparent/holographic blocks).
 */
function SolidLegAnatomy3DModel({
  muscleGroups,
  activeMuscleId,
  onSelect,
  wireframe,
}: {
  muscleGroups: MuscleInfo[];
  activeMuscleId: string;
  onSelect: (m: MuscleInfo) => void;
  wireframe: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);

  // Natural subtle breathing motion
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 1.2) * 0.015 + 0.12;
    }
  });

  const getStatusColor = (status: string, isActive: boolean) => {
    if (isActive) return '#00f0ff';
    if (status === 'optimal') return '#00e5ff';
    if (status === 'needs_focus') return '#ffb703';
    return '#ff0055';
  };

  const BASE_BODY_COLOR = '#94a3b8';
  const BASE_BODY_EMISSIVE = '#1e293b';

  const getSolidMaterial = (id: string, status: string) => {
    const isActive = activeMuscleId === id;
    const accentColor = getStatusColor(status, isActive);

    return {
      color: isActive ? accentColor : BASE_BODY_COLOR,
      wireframe,
      transparent: false,
      opacity: 1.0,
      metalness: isActive ? 0.35 : 0.25,
      roughness: isActive ? 0.2 : 0.35,
      emissive: isActive ? accentColor : BASE_BODY_EMISSIVE,
      emissiveIntensity: isActive ? 0.65 : 0.08,
    };
  };

  return (
    <group ref={groupRef} position={[0, 0.45, 0]}>
      {/* --- SOLID CONTINUOUS ANATOMICAL HUMAN ATHLETE BODY MESH --- */}

      {/* Head & Neck */}
      <group position={[0, 1.82, 0]}>
        <mesh position={[0, 0.2, 0]} scale={[0.88, 1.1, 0.95]}>
          <sphereGeometry args={[0.2, 32, 32]} />
          <meshStandardMaterial color={BASE_BODY_COLOR} roughness={0.4} metalness={0.15} wireframe={wireframe} />
        </mesh>
        {/* Neck Muscles */}
        <mesh position={[0, -0.06, 0]}>
          <capsuleGeometry args={[0.11, 0.18, 16, 32]} />
          <meshStandardMaterial color={BASE_BODY_COLOR} roughness={0.4} metalness={0.15} wireframe={wireframe} />
        </mesh>
      </group>

      {/* Upper Torso & Shoulder Girdle */}
      <group position={[0, 1.45, 0]}>
        {/* Pectorals & Ribcage */}
        <mesh position={[0, 0, 0]} rotation={[0.08, 0, 0]}>
          <capsuleGeometry args={[0.34, 0.38, 16, 32]} />
          <meshStandardMaterial color={BASE_BODY_COLOR} roughness={0.4} metalness={0.15} wireframe={wireframe} />
        </mesh>
        {/* Left Deltoid Shoulder */}
        <mesh position={[-0.42, 0.1, 0]} rotation={[0, 0, 0.2]}>
          <capsuleGeometry args={[0.14, 0.22, 16, 32]} />
          <meshStandardMaterial color={BASE_BODY_COLOR} roughness={0.4} metalness={0.15} wireframe={wireframe} />
        </mesh>
        {/* Right Deltoid Shoulder */}
        <mesh position={[0.42, 0.1, 0]} rotation={[0, 0, -0.2]}>
          <capsuleGeometry args={[0.14, 0.22, 16, 32]} />
          <meshStandardMaterial color={BASE_BODY_COLOR} roughness={0.4} metalness={0.15} wireframe={wireframe} />
        </mesh>
      </group>

      {/* 1. Core & Abdominals Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'core');
        if (!m) return null;
        const mat = getSolidMaterial('core', m.status);
        return (
          <group position={[0, 0.96, 0.02]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Abdominal Core Muscle Wall */}
            <mesh position={[0, 0, 0]}>
              <capsuleGeometry args={[0.30, 0.44, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Contoured Rectus Abdominis Muscle Striations */}
            {[-0.14, -0.02, 0.1].map((yOffset, i) => (
              <group key={i} position={[0, yOffset, 0.25]}>
                <mesh position={[-0.08, 0, 0]}>
                  <capsuleGeometry args={[0.045, 0.09, 12, 24]} />
                  <meshStandardMaterial color={mat.color} roughness={0.35} wireframe={wireframe} />
                </mesh>
                <mesh position={[0.08, 0, 0]}>
                  <capsuleGeometry args={[0.045, 0.09, 12, 24]} />
                  <meshStandardMaterial color={mat.color} roughness={0.35} wireframe={wireframe} />
                </mesh>
              </group>
            ))}
          </group>
        );
      })()}

      {/* 2. Pelvis & Hip Joints Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'hip_joints');
        if (!m) return null;
        const mat = getSolidMaterial('hip_joints', m.status);
        return (
          <group position={[0, 0.48, 0]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Pelvic Basin Body */}
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <capsuleGeometry args={[0.26, 0.36, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Left Hip Joint & Tensor Fasciae */}
            <mesh position={[-0.30, -0.06, 0.02]} rotation={[0.1, 0, 0.15]}>
              <capsuleGeometry args={[0.17, 0.20, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Right Hip Joint & Tensor Fasciae */}
            <mesh position={[0.30, -0.06, 0.02]} rotation={[0.1, 0, -0.15]}>
              <capsuleGeometry args={[0.17, 0.20, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        );
      })()}

      {/* 3. Quadriceps Thighs Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'quads');
        if (!m) return null;
        const mat = getSolidMaterial('quads', m.status);
        return (
          <group position={[0, -0.22, 0.05]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Left Quad Muscle Belly (Rectus Femoris & Vastus Lateralis) */}
            <mesh position={[-0.28, 0.02, 0.02]} rotation={[0.08, 0, -0.06]}>
              <capsuleGeometry args={[0.20, 0.78, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Left Vastus Medialis (Teardrop Muscle) */}
            <mesh position={[-0.22, -0.28, 0.1]} rotation={[0.1, 0.2, -0.15]}>
              <capsuleGeometry args={[0.13, 0.24, 16, 24]} />
              <meshStandardMaterial {...mat} />
            </mesh>

            {/* Right Quad Muscle Belly */}
            <mesh position={[0.28, 0.02, 0.02]} rotation={[0.08, 0, 0.06]}>
              <capsuleGeometry args={[0.20, 0.78, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Right Vastus Medialis (Teardrop Muscle) */}
            <mesh position={[0.22, -0.28, 0.1]} rotation={[0.1, -0.2, 0.15]}>
              <capsuleGeometry args={[0.13, 0.24, 16, 24]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        );
      })()}

      {/* 4. Hamstrings & Glutes Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'hamstrings');
        if (!m) return null;
        const mat = getSolidMaterial('hamstrings', m.status);
        return (
          <group position={[0, -0.18, -0.14]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Left Gluteus Maximus */}
            <mesh position={[-0.28, 0.42, -0.06]} rotation={[-0.2, 0, -0.1]}>
              <capsuleGeometry args={[0.22, 0.26, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Left Hamstring Biceps Femoris */}
            <mesh position={[-0.28, -0.04, -0.02]} rotation={[-0.06, 0, -0.04]}>
              <capsuleGeometry args={[0.18, 0.74, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>

            {/* Right Gluteus Maximus */}
            <mesh position={[0.28, 0.42, -0.06]} rotation={[-0.2, 0, 0.1]}>
              <capsuleGeometry args={[0.28 > 0 ? 0.22 : 0.22, 0.26, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Right Hamstring Biceps Femoris */}
            <mesh position={[0.28, -0.04, -0.02]} rotation={[-0.06, 0, 0.04]}>
              <capsuleGeometry args={[0.18, 0.74, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        );
      })()}

      {/* 5. Knee Joints Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'knee_joints');
        if (!m) return null;
        const mat = getSolidMaterial('knee_joints', m.status);
        return (
          <group position={[0, -0.78, 0.06]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Left Knee Joint & Patella */}
            <mesh position={[-0.28, 0, 0]}>
              <capsuleGeometry args={[0.15, 0.20, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[-0.28, 0.02, 0.13]}>
              <capsuleGeometry args={[0.07, 0.11, 12, 24]} />
              <meshStandardMaterial color={mat.color} roughness={0.3} wireframe={wireframe} />
            </mesh>

            {/* Right Knee Joint & Patella */}
            <mesh position={[0.28, 0, 0]}>
              <capsuleGeometry args={[0.15, 0.20, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            <mesh position={[0.28, 0.02, 0.13]}>
              <capsuleGeometry args={[0.07, 0.11, 12, 24]} />
              <meshStandardMaterial color={mat.color} roughness={0.3} wireframe={wireframe} />
            </mesh>
          </group>
        );
      })()}

      {/* 6. Calves Target (Gastrocnemius & Soleus) */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'calves');
        if (!m) return null;
        const mat = getSolidMaterial('calves', m.status);
        return (
          <group position={[0, -1.36, -0.03]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Left Calf Gastrocnemius (Upper Bulb) */}
            <mesh position={[-0.28, 0.16, -0.06]} rotation={[-0.15, 0, -0.05]}>
              <capsuleGeometry args={[0.17, 0.38, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Left Tibialis / Lower Shin Taper */}
            <mesh position={[-0.28, -0.16, 0.02]} rotation={[0.05, 0, -0.02]}>
              <capsuleGeometry args={[0.12, 0.62, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>

            {/* Right Calf Gastrocnemius (Upper Bulb) */}
            <mesh position={[0.28, 0.16, -0.06]} rotation={[-0.15, 0, 0.05]}>
              <capsuleGeometry args={[0.17, 0.38, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Right Tibialis / Lower Shin Taper */}
            <mesh position={[0.28, -0.16, 0.02]} rotation={[0.05, 0, 0.02]}>
              <capsuleGeometry args={[0.12, 0.62, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        );
      })()}

      {/* 7. Ankles & Feet Target */}
      {(() => {
        const m = muscleGroups.find((item) => item.id === 'ankle_joints');
        if (!m) return null;
        const mat = getSolidMaterial('ankle_joints', m.status);
        return (
          <group position={[0, -1.84, 0]} onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
            {/* Left Ankle Malleolus & Foot Instep */}
            <mesh position={[-0.28, 0.04, 0]}>
              <capsuleGeometry args={[0.11, 0.14, 16, 24]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Left Foot Base */}
            <mesh position={[-0.28, -0.12, 0.12]} rotation={[0.25, 0, 0]}>
              <capsuleGeometry args={[0.11, 0.34, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>

            {/* Right Ankle Malleolus & Foot Instep */}
            <mesh position={[0.28, 0.04, 0]}>
              <capsuleGeometry args={[0.11, 0.14, 16, 24]} />
              <meshStandardMaterial {...mat} />
            </mesh>
            {/* Right Foot Base */}
            <mesh position={[0.28, -0.12, 0.12]} rotation={[0.25, 0, 0]}>
              <capsuleGeometry args={[0.11, 0.34, 16, 32]} />
              <meshStandardMaterial {...mat} />
            </mesh>
          </group>
        );
      })()}

      {/* --- PINPOINT INDICATOR NODES --- */}
      {muscleGroups.map((m) => {
        const isActive = activeMuscleId === m.id;
        const color = getStatusColor(m.status, isActive);

        return (
          <group key={m.id} position={m.pos3D}>
            {/* Pinpoint Node Marker */}
            <mesh onClick={(e) => { e.stopPropagation(); onSelect(m); }}>
              <sphereGeometry args={[isActive ? 0.08 : 0.05, 16, 16]} />
              <meshBasicMaterial color={isActive ? '#ffffff' : color} />
            </mesh>
          </group>
        );
      })}

      {/* Solid Studio Floor Base */}
      <mesh position={[0, -2.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.2, 32]} />
        <meshBasicMaterial color="#1e293b" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

export function HumanModel3D({
  assessments = [],
  potential = null,
  selectedExercise = 'squat',
  onSelectExercise,
  onSelectMuscle,
}: HumanModel3DProps) {
  const verified = useMemo(
    () =>
      Array.isArray(assessments)
        ? assessments.filter(
            (a) => a?.integrity === 'verified'
          )
        : [],
    [assessments]
  );
  const latestSquat = useMemo(() => verified.find((a) => a?.test === 'squat'), [verified]);

  const muscleGroups: MuscleInfo[] = useMemo(() => {
    const squatAccuracy = latestSquat?.metrics.formAccuracyPercent ?? 88;
    const squatValidReps = latestSquat?.metrics.validReps ?? 0;
    const squatTotalAttempts = latestSquat?.metrics.totalAttempts ?? squatValidReps;
    const squatAsymmetry = latestSquat?.metrics.avgAsymmetryDeg ?? 5;

    const quadScore = Math.round(squatAccuracy);
    const hamScore = Math.round(potential?.components?.explosiveness ?? Math.max(75, squatAccuracy * 0.96));
    const kneeJointScore = Math.round(Math.max(50, 100 - squatAsymmetry * 2.8));
    const coreScore = Math.round(potential?.components?.movementQuality ?? 90);
    const hipJointScore = Math.round(potential?.components?.coordination ?? 88);
    const calfScore = Math.round(Math.min(96, squatAccuracy * 0.94));
    const ankleJointScore = Math.round(Math.max(60, 100 - squatAsymmetry * 2.2));

    const getStatus = (sc: number): 'optimal' | 'needs_focus' | 'fatigued' =>
      sc >= 85 ? 'optimal' : sc >= 70 ? 'needs_focus' : 'fatigued';

    return [
      {
        id: 'core',
        name: 'Abs & Core',
        locationName: 'Core Bracing & Spinal Alignment',
        exercise: 'Squat Core Bracing & Torso Support',
        exerciseType: 'squat',
        status: getStatus(coreScore),
        score: coreScore,
        pos3D: [0, 0.95, 0.18],
        whereToImprove: 'Spinal neutrality & anti-extension bracing',
        howToImprove: 'Brace core tight before descending to prevent torso forward collapse during deep squats.',
        recommendedDrills: ['Plank Bracing', 'Hollow Body Holds', 'Goblet Squat Core Holds'],
      },
      {
        id: 'hip_joints',
        name: 'Hip Joints',
        locationName: 'Pelvis & Hip Extension Chain',
        exercise: 'Squat Hip Hinge & Pelvic Alignment',
        exerciseType: 'squat',
        status: getStatus(hipJointScore),
        score: hipJointScore,
        pos3D: [0.32, 0.4, 0.05],
        whereToImprove: 'Symmetrical hip hinge drive & depth',
        howToImprove: 'Hinge hips back evenly without shifting weight onto one side.',
        recommendedDrills: ['Glute Bridges', 'Hip Hinge Wall Touches', 'Kettlebell Hinge Drills'],
      },
      {
        id: 'quads',
        name: 'Thighs & Quads',
        locationName: 'Front Thighs (Rectus Femoris & Quadriceps)',
        exercise: 'Squat Drive & Knee Extension',
        exerciseType: 'squat',
        status: getStatus(quadScore),
        score: quadScore,
        pos3D: [-0.32, -0.22, 0.18],
        whereToImprove: latestSquat?.metrics.qualityFlags?.[0] ?? 'Parallel thigh squat depth (flexion <= 95°)',
        howToImprove: latestSquat
          ? `Recorded ${squatValidReps} accurate reps out of ${squatTotalAttempts} attempts (${squatAccuracy.toFixed(1)}% accuracy). Lower hips until thighs are parallel to ground.`
          : 'Squat down until thighs are parallel to the ground (knee angle <= 95°) before ascending.',
        recommendedDrills: ['Parallel Box Squats', 'Goblet Squats', 'Tempo Eccentric Squats'],
      },
      {
        id: 'hamstrings',
        name: 'Hamstrings & Glutes',
        locationName: 'Back Thighs & Posterior Chain',
        exercise: 'Squat Concentric Drive & Hip Extension',
        exerciseType: 'squat',
        status: getStatus(hamScore),
        score: hamScore,
        pos3D: [0.32, -0.18, -0.2],
        whereToImprove: 'Posterior chain drive & glute lockout',
        howToImprove: 'Drive through heels and squeeze glutes explosive at the top of the squat ascent.',
        recommendedDrills: ['Romanian Deadlifts', 'Pause Squats', 'Barbell Glute Bridges'],
      },
      {
        id: 'knee_joints',
        name: 'Knee Joints',
        locationName: 'Left & Right Knee Joint Flexion',
        exercise: 'Knee Tracking & Bilateral Balance',
        exerciseType: 'squat',
        status: getStatus(kneeJointScore),
        score: kneeJointScore,
        pos3D: [-0.32, -0.78, 0.14],
        whereToImprove: `Knee Asymmetry: ${squatAsymmetry.toFixed(1)}° recorded during squat drive`,
        howToImprove: 'Ensure left and right knee joint angles remain balanced and track over middle toes without valgus collapse.',
        recommendedDrills: ['Banded Knee Abduction Squats', 'Single-Leg Balance', 'Step Downs'],
      },
      {
        id: 'calves',
        name: 'Calves',
        locationName: 'Lower Legs (Gastrocnemius & Soleus)',
        exercise: 'Ankle Stabilization & Heel Grounding',
        exerciseType: 'squat',
        status: getStatus(calfScore),
        score: calfScore,
        pos3D: [0.32, -1.35, -0.12],
        whereToImprove: 'Ankle dorsiflexion mobility & eccentric braking',
        howToImprove: 'Maintain full heel contact with the floor throughout the entire squat motion.',
        recommendedDrills: ['Calf Wall Stretch', 'Soleus Eccentric Holds', 'Ankle Mobilization'],
      },
      {
        id: 'ankle_joints',
        name: 'Ankle Joints',
        locationName: 'Left & Right Ankle Flexion & Support',
        exercise: 'Ankle Flexion & Base Tripod Support',
        exerciseType: 'squat',
        status: getStatus(ankleJointScore),
        score: ankleJointScore,
        pos3D: [-0.32, -1.82, 0.12],
        whereToImprove: 'Tripod foot contact & dorsiflexion ROM',
        howToImprove: 'Distribute body weight evenly across tripod foot points (heel, big toe, pinky toe).',
        recommendedDrills: ['Ankle Band Shifts', 'Goblet Ankle Shifts', 'Barefoot Squat Drills'],
      },
    ];
  }, [latestSquat, potential]);

  const [hoveredMuscle, setHoveredMuscle] = useState<MuscleInfo>(muscleGroups[2]!); // Default Quads
  const [wireframe, setWireframe] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);

  const handleSelect = (m: MuscleInfo) => {
    setHoveredMuscle(m);
    onSelectMuscle?.(m);
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '560px',
        display: 'flex',
        flexWrap: 'wrap',
        background: '#070b15',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        border: '1px solid rgba(0, 240, 255, 0.25)',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6)',
      }}
    >
      {/* Sidebar Muscle Target List */}
      <div
        style={{
          width: '240px',
          background: '#0d1322',
          borderRight: '1px solid #202a40',
          padding: '18px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          zIndex: 10,
        }}
      >
        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1.2px', color: '#00f0ff', fontWeight: 700 }}>
          Leg Anatomy Muscle Targets
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
          {muscleGroups.map((m) => {
            const isActive = hoveredMuscle.id === m.id;
            const dotColor =
              m.status === 'optimal' ? '#00f0ff' : m.status === 'needs_focus' ? '#ffb703' : '#ff0055';

            return (
              <button
                key={m.id}
                onClick={() => handleSelect(m)}
                style={{
                  border: `1px solid ${isActive ? '#00f0ff' : 'transparent'}`,
                  background: isActive ? '#18243b' : 'transparent',
                  color: isActive ? '#ffffff' : '#b8c1d5',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  transition: 'all 0.15s ease',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: dotColor,
                      boxShadow: isActive ? `0 0 8px ${dotColor}` : 'none',
                    }}
                  />
                  {m.name}
                </span>
                <span style={{ fontSize: '11px', opacity: 0.8 }}>{m.score}%</span>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #202a40', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '10px', color: '#68758f', textTransform: 'uppercase', letterSpacing: '1px' }}>
            3D View Controls
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              style={{
                background: autoRotate ? 'rgba(0, 240, 255, 0.15)' : '#141d30',
                border: '1px solid #26324b',
                color: autoRotate ? '#00f0ff' : '#cbd4e7',
                borderRadius: '6px',
                padding: '6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              {autoRotate ? '⏸️ Pause' : '🔄 Rotate'}
            </button>
            <button
              onClick={() => setWireframe(!wireframe)}
              style={{
                background: wireframe ? 'rgba(0, 240, 255, 0.15)' : '#141d30',
                border: '1px solid #26324b',
                color: wireframe ? '#00f0ff' : '#cbd4e7',
                borderRadius: '6px',
                padding: '6px',
                fontSize: '10px',
                cursor: 'pointer',
              }}
            >
              {wireframe ? '🎨 Solid' : '🦴 Wireframe'}
            </button>
          </div>
        </div>
      </div>

      {/* Main 3D WebGL Canvas Area */}
      <div style={{ flex: '1 1 340px', height: '560px', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 10, pointerEvents: 'none' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.5px' }}>
            3D Solid Leg Anatomy &amp; Squats
          </h2>
          <p style={{ margin: '4px 0 0', color: '#8f9ab2', fontSize: '11px' }}>
            Drag to rotate 360° • Click muscle target to inspect biomechanical analysis
          </p>
        </div>

        <Canvas
          camera={{ position: [0, 0.3, 4.4], fov: 42 }}
          style={{ width: '100%', height: '100%', background: '#0b1329' }}
        >
          {/* Bright Studio Lighting Setup */}
          <ambientLight intensity={1.3} />
          <directionalLight position={[6, 10, 8]} intensity={2.2} castShadow />
          <directionalLight position={[-6, 4, 6]} intensity={1.2} color="#38bdf8" />
          <pointLight position={[0, 3, 5]} color="#ffffff" intensity={1.2} />
          <pointLight position={[0, 1, -4]} color="#00f0ff" intensity={1.8} />

          <SolidLegAnatomy3DModel
            muscleGroups={muscleGroups}
            activeMuscleId={hoveredMuscle.id}
            onSelect={handleSelect}
            wireframe={wireframe}
          />

          <OrbitControls
            enablePan={false}
            enableZoom={true}
            minDistance={2.5}
            maxDistance={6.5}
            autoRotate={autoRotate}
            autoRotateSpeed={1.5}
          />
        </Canvas>

        <div style={{ position: 'absolute', bottom: 12, left: 16, zIndex: 10, fontSize: '10px', color: '#67748c' }}>
          💡 Powered by WebGL Three.js Solid 3D Engine
        </div>
      </div>

      {/* Right Side Diagnostic Info Card */}
      {hoveredMuscle && (
        <div
          className="fz-card fz-animate-in"
          style={{
            position: 'absolute',
            right: '18px',
            bottom: '18px',
            width: '310px',
            background: 'rgba(13, 19, 34, 0.94)',
            backdropFilter: 'blur(16px)',
            border: '1px solid #2a3853',
            borderRadius: '16px',
            padding: '18px',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
            zIndex: 20,
          }}
        >
          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.4px', color: '#7f8da8' }}>
            MUSCLE &amp; JOINT TARGET
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 8px' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff' }}>{hoveredMuscle.name}</h3>
            <span
              style={{
                padding: '3px 8px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                background: hoveredMuscle.status === 'optimal' ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 183, 3, 0.15)',
                color: hoveredMuscle.status === 'optimal' ? '#00f0ff' : '#ffb703',
                border: `1px solid ${hoveredMuscle.status === 'optimal' ? '#00f0ff' : '#ffb703'}`,
              }}
            >
              {hoveredMuscle.score}% Score
            </span>
          </div>

          <p style={{ margin: '0 0 10px', color: '#aab5c9', fontSize: '11px', lineHeight: 1.5 }}>
            📍 {hoveredMuscle.locationName}
          </p>

          <div style={{ margin: '8px 0', padding: '8px 10px', background: 'rgba(0, 240, 255, 0.08)', borderRadius: '8px', borderLeft: '3px solid #00f0ff' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#00f0ff', textTransform: 'uppercase' }}>
              🏋️ Primary Squat Target
            </div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', marginTop: '2px' }}>
              {hoveredMuscle.exercise}
            </div>
          </div>

          <div style={{ display: 'grid', gap: '8px', fontSize: '11px', marginTop: '10px' }}>
            <div>
              <strong style={{ color: '#ffffff', display: 'block' }}>Form Diagnostic:</strong>
              <span style={{ color: '#aab5c9' }}>{hoveredMuscle.whereToImprove}</span>
            </div>

            <div>
              <strong style={{ color: '#00f0ff', display: 'block' }}>Biomechanical Advice:</strong>
              <span style={{ color: '#ffffff' }}>{hoveredMuscle.howToImprove}</span>
            </div>

            <div>
              <strong style={{ color: '#68758f', fontSize: '10px', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                ⚡ Recommended Drills:
              </strong>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {hoveredMuscle.recommendedDrills.map((drill) => (
                  <span
                    key={drill}
                    style={{
                      padding: '2px 6px',
                      background: '#19243a',
                      borderRadius: '4px',
                      fontSize: '10px',
                      color: '#00f0ff',
                      border: '1px solid #263859',
                    }}
                  >
                    {drill}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
