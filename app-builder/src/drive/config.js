// Saving to a student's own drive (ROADMAP › Sign in to save to your drive). App Builder has no server: the student
// signs in, and App Builder reads and writes files in an "App Builder" folder in their own OneDrive or Google Drive.
//
// Client IDs are public (they name the app to Microsoft and Google; there is no secret). A provider with no client ID
// is simply not offered, and with neither, the Drive button doesn't show. See README › Your drive for registering.
export const DRIVE = {
  microsoft: {
    clientId: '5fc6e54b-6e3d-47f1-ac2d-31fb391d2d55',
    // the address Microsoft sends the student back to after signing in: auth.html beside App Builder
    // (each address App Builder is served from must be listed in the app registration)
  },
  google: {
    clientId: '',
  },
};
export const configured = () => Object.entries(DRIVE).filter(([, c]) => c.clientId).map(([id]) => id);
