export interface IkarosDiscussion {
  id: string;
  title: string;
  description: string;
  bulletin: string;
  creatorId: string;
  creatorName: string;
  isApproved: boolean;
  isOpen: boolean;
  managerIds: string[];
  invitedUserIds: string[];
  postCount: number;
  likeCount: number;
  createdAtUtc: Date;
  lastActivityUtc: Date;
}

export interface IkarosDiscussionPost {
  id: string;
  discussionId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAtUtc: Date;
}
