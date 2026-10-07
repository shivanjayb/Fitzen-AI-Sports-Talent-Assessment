let pending: File | null = null;
export const setPendingVideo = (file: File | null) => { pending = file; };
export const getPendingVideo = () => pending;
