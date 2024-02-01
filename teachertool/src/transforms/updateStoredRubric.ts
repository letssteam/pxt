import { deleteRubricAsync, saveRubricAsync } from "../services/indexedDbService";
import { Rubric } from "../types/rubric";

export async function updateStoredRubricAsync(oldRubric: Rubric | undefined, newRubric: Rubric | undefined) {
    const renamed = oldRubric && newRubric && oldRubric?.name !== newRubric.name;
    const deleted = oldRubric && !newRubric;

    if (newRubric) {
        await saveRubricAsync(newRubric);
    }

    if (renamed || deleted) {
        await deleteRubricAsync(oldRubric.name);
    }
}
