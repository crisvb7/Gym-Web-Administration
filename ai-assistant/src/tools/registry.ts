import { updateMemberImpl } from "./members.js";
import { createClassImpl } from "./classes.js";
import { registerPaymentImpl } from "./billing.js";
import { assignWorkoutPlanImpl } from "./workouts.js";
import { assignMealPlanImpl } from "./nutrition.js";

/**
 * Implementaciones "en crudo" de las herramientas que escriben datos, indexadas por nombre.
 * El servidor las usa para ejecutar una acción pendiente DIRECTAMENTE cuando el usuario pulsa
 * "Confirmar" en la interfaz, sin depender de que el modelo decida volver a llamarlas.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const writeToolImplementations: Record<string, (args: any) => Promise<string>> = {
  update_member: updateMemberImpl,
  create_class: createClassImpl,
  register_payment: registerPaymentImpl,
  assign_workout_plan: assignWorkoutPlanImpl,
  assign_meal_plan: assignMealPlanImpl,
};
