import { listMembers, getMember, updateMember } from "./members.js";
import { listClasses, listDisciplines, createClass } from "./classes.js";
import { listInvoices, registerPayment } from "./billing.js";
import { dashboardSummary } from "./dashboard.js";
import { listExercises, listWorkoutPlan, assignWorkoutPlan } from "./workouts.js";
import { listRecipes, listMealPlan, assignMealPlan } from "./nutrition.js";
import { listLocalFiles, readLocalFile } from "./localFiles.js";
import { listScheduledTasks, createScheduledTask, deleteScheduledTask } from "./tasks.js";
import { listClassBookings, listWorkoutLogs, listNutritionLogs, listCalorieGoalHistory } from "./activity.js";

export const tools = [
  listMembers,
  getMember,
  updateMember,
  listClasses,
  listDisciplines,
  createClass,
  listInvoices,
  registerPayment,
  dashboardSummary,
  listExercises,
  listWorkoutPlan,
  assignWorkoutPlan,
  listRecipes,
  listMealPlan,
  assignMealPlan,
  listLocalFiles,
  readLocalFile,
  listScheduledTasks,
  createScheduledTask,
  deleteScheduledTask,
  listClassBookings,
  listWorkoutLogs,
  listNutritionLogs,
  listCalorieGoalHistory,
];
